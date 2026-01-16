import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, AuthRequest, requireRole } from '../middleware/auth';

export const scriptRouter = Router();

// All routes require authentication
scriptRouter.use(authenticate);

const createScriptSchema = z.object({
  name: z.string().min(2),
  displayName: z.string().min(2),
  description: z.string().optional(),
  code: z.string().min(1),
  parameters: z.array(z.any()).optional(),
  outputs: z.array(z.any()).optional(),
  isGlobal: z.boolean().default(false),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  tenantIds: z.array(z.string().uuid()).optional(), // For non-global scripts
});

const updateScriptSchema = createScriptSchema.partial().omit({ tenantIds: true });

// Get all scripts available to user (global + their tenants' scripts)
scriptRouter.get('/', async (req: AuthRequest, res) => {
  try {
    const { tenantId, category, search } = req.query;

    const scripts = await prisma.script.findMany({
      where: {
        OR: [
          { isGlobal: true },
          {
            tenantAssignments: {
              some: {
                tenantId: {
                  in: req.user!.tenantIds,
                },
              },
            },
          },
        ],
        ...(tenantId && {
          OR: [
            { isGlobal: true },
            {
              tenantAssignments: {
                some: { tenantId: tenantId as string },
              },
            },
          ],
        }),
        ...(category && { category: category as string }),
        ...(search && {
          OR: [
            { name: { contains: search as string, mode: 'insensitive' } },
            { displayName: { contains: search as string, mode: 'insensitive' } },
            { description: { contains: search as string, mode: 'insensitive' } },
          ],
        }),
      },
      include: {
        creator: {
          select: {
            id: true,
            username: true,
          },
        },
        tenantAssignments: {
          include: {
            tenant: {
              select: {
                id: true,
                name: true,
                displayName: true,
              },
            },
          },
        },
        _count: {
          select: {
            workflowSteps: true,
            executionLogs: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.json(scripts);
  } catch (error) {
    console.error('List scripts error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get script by ID
scriptRouter.get('/:scriptId', async (req: AuthRequest, res) => {
  try {
    const { scriptId } = req.params;

    const script = await prisma.script.findUnique({
      where: { id: scriptId },
      include: {
        creator: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
        tenantAssignments: {
          include: {
            tenant: true,
          },
        },
      },
    });

    if (!script) {
      return res.status(404).json({ error: 'Script not found' });
    }

    // Check if user has access
    const hasAccess =
      script.isGlobal ||
      script.tenantAssignments.some(ta =>
        req.user!.tenantIds.includes(ta.tenantId)
      );

    if (!hasAccess) {
      return res.status(403).json({ error: 'No access to this script' });
    }

    res.json(script);
  } catch (error) {
    console.error('Get script error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create script (admin or script_manager role)
scriptRouter.post('/', requireRole(['admin', 'script_manager']), async (req: AuthRequest, res) => {
  try {
    const data = createScriptSchema.parse(req.body);

    const script = await prisma.script.create({
      data: {
        name: data.name,
        displayName: data.displayName,
        description: data.description,
        code: data.code,
        parameters: data.parameters || [],
        outputs: data.outputs || [],
        isGlobal: data.isGlobal,
        category: data.category,
        tags: data.tags || [],
        createdBy: req.user!.userId,
      },
    });

    // Assign to tenants if not global
    if (!data.isGlobal && data.tenantIds && data.tenantIds.length > 0) {
      await prisma.scriptTenantAssignment.createMany({
        data: data.tenantIds.map(tenantId => ({
          scriptId: script.id,
          tenantId,
        })),
      });
    }

    // Fetch complete script with relations
    const completeScript = await prisma.script.findUnique({
      where: { id: script.id },
      include: {
        creator: {
          select: {
            id: true,
            username: true,
          },
        },
        tenantAssignments: {
          include: {
            tenant: true,
          },
        },
      },
    });

    res.status(201).json(completeScript);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Create script error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update script (admin or script_manager role)
scriptRouter.patch('/:scriptId', requireRole(['admin', 'script_manager']), async (req: AuthRequest, res) => {
  try {
    const { scriptId } = req.params;
    const data = updateScriptSchema.parse(req.body);

    const script = await prisma.script.update({
      where: { id: scriptId },
      data,
      include: {
        creator: {
          select: {
            id: true,
            username: true,
          },
        },
        tenantAssignments: {
          include: {
            tenant: true,
          },
        },
      },
    });

    res.json(script);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Update script error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete script (admin only)
scriptRouter.delete('/:scriptId', requireRole(['admin']), async (req: AuthRequest, res) => {
  try {
    const { scriptId } = req.params;

    await prisma.script.delete({
      where: { id: scriptId },
    });

    res.status(204).send();
  } catch (error) {
    console.error('Delete script error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Assign script to tenant
const assignScriptSchema = z.object({
  scriptId: z.string().uuid(),
  tenantId: z.string().uuid(),
  config: z.record(z.any()).optional(),
});

scriptRouter.post('/assign-tenant', requireRole(['admin', 'script_manager']), async (req: AuthRequest, res) => {
  try {
    const data = assignScriptSchema.parse(req.body);

    const assignment = await prisma.scriptTenantAssignment.create({
      data: {
        scriptId: data.scriptId,
        tenantId: data.tenantId,
        config: data.config || {},
      },
      include: {
        script: true,
        tenant: true,
      },
    });

    res.status(201).json(assignment);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Assign script error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Unassign script from tenant
scriptRouter.delete('/unassign-tenant', requireRole(['admin', 'script_manager']), async (req: AuthRequest, res) => {
  try {
    const { scriptId, tenantId } = assignScriptSchema.parse(req.body);

    await prisma.scriptTenantAssignment.delete({
      where: {
        scriptId_tenantId: {
          scriptId,
          tenantId,
        },
      },
    });

    res.status(204).send();
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Unassign script error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
