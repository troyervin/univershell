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

const importScriptSchema = z.object({
  script: z.object({
    name: z.string().min(2),
    displayName: z.string().min(2),
    description: z.string().optional(),
    code: z.string().min(1),
    parameters: z.array(z.any()).optional(),
    outputs: z.array(z.any()).optional(),
    category: z.string().optional(),
    tags: z.array(z.string()).optional(),
    requiresAuth: z.boolean().optional(),
    authType: z.enum(['APPLICATION', 'DELEGATED']).nullable().optional(),
    credentialType: z.string().optional(),
  }),
  isGlobal: z.boolean().default(false),
  tenantIds: z.array(z.string().uuid()).optional(),
});

// Helper function to check if user can manage scripts
function canManageScript(user: any, script: any): boolean {
  // Global admins can manage all scripts
  if (user.roles.includes('admin')) {
    return true;
  }

  // Script managers can manage scripts
  if (user.roles.includes('script_manager')) {
    return true;
  }

  // Tenant admins can manage scripts assigned to their tenants
  if (script.isGlobal) {
    return false; // Tenant admins cannot manage global scripts
  }

  // Check if user is admin of any tenant this script is assigned to
  const scriptTenantIds = script.tenantAssignments?.map((ta: any) => ta.tenantId) || [];
  const userAdminTenantIds = Object.entries(user.tenantRoles || {})
    .filter(([_, role]) => role === 'ADMIN')
    .map(([tenantId, _]) => tenantId);

  return scriptTenantIds.some((tid: string) => userAdminTenantIds.includes(tid));
}

// Get all scripts available to user (global + their tenants' scripts)
scriptRouter.get('/', async (req: AuthRequest, res) => {
  try {
    const { tenantId, category, search, manageable } = req.query;
    const isGlobalAdmin = req.user!.roles.includes('admin');

    // Build where clause based on user permissions
    let whereClause: any = {};

    if (manageable === 'true') {
      // Filter to only scripts user can manage
      if (isGlobalAdmin || req.user!.roles.includes('script_manager')) {
        // Global admins and script managers see all scripts
        whereClause = {};
      } else {
        // Tenant admins see only their tenant's scripts
        const adminTenantIds = Object.entries(req.user!.tenantRoles || {})
          .filter(([_, role]) => role === 'ADMIN')
          .map(([tenantId, _]) => tenantId);

        if (adminTenantIds.length === 0) {
          return res.json([]); // Not an admin of any tenant
        }

        whereClause = {
          tenantAssignments: {
            some: {
              tenantId: { in: adminTenantIds },
            },
          },
        };
      }
    } else {
      // Normal view - scripts user can execute
      whereClause = {
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
      };
    }

    // Add additional filters
    if (tenantId) {
      whereClause = {
        ...whereClause,
        OR: [
          { isGlobal: true },
          {
            tenantAssignments: {
              some: { tenantId: tenantId as string },
            },
          },
        ],
      };
    }

    if (category) {
      whereClause.category = category as string;
    }

    if (search) {
      whereClause.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { displayName: { contains: search as string, mode: 'insensitive' } },
        { description: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    const scripts = await prisma.script.findMany({
      where: whereClause,
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

// Update script (admin, script_manager, or tenant admin)
scriptRouter.patch('/:scriptId', authenticate, async (req: AuthRequest, res) => {
  try {
    const { scriptId } = req.params;
    const data = updateScriptSchema.parse(req.body);

    // Fetch existing script to check permissions
    const existingScript = await prisma.script.findUnique({
      where: { id: scriptId },
      include: {
        tenantAssignments: true,
      },
    });

    if (!existingScript) {
      return res.status(404).json({ error: 'Script not found' });
    }

    // Check if user can manage this script
    if (!canManageScript(req.user!, existingScript)) {
      return res.status(403).json({ error: 'Not authorized to update this script' });
    }

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

// Delete script (admin, script_manager, or tenant admin)
scriptRouter.delete('/:scriptId', authenticate, async (req: AuthRequest, res) => {
  try {
    const { scriptId } = req.params;

    // Fetch existing script to check permissions
    const existingScript = await prisma.script.findUnique({
      where: { id: scriptId },
      include: {
        tenantAssignments: true,
      },
    });

    if (!existingScript) {
      return res.status(404).json({ error: 'Script not found' });
    }

    // Check if user can manage this script
    if (!canManageScript(req.user!, existingScript)) {
      return res.status(403).json({ error: 'Not authorized to delete this script' });
    }

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

// Export script as JSON
scriptRouter.get('/export/:scriptId', authenticate, async (req: AuthRequest, res) => {
  try {
    const { scriptId } = req.params;

    const script = await prisma.script.findUnique({
      where: { id: scriptId },
      include: {
        tenantAssignments: {
          include: {
            tenant: {
              select: {
                name: true,
                displayName: true,
              },
            },
          },
        },
      },
    });

    if (!script) {
      return res.status(404).json({ error: 'Script not found' });
    }

    // Check if user can manage this script
    if (!canManageScript(req.user!, script)) {
      return res.status(403).json({ error: 'Not authorized to export this script' });
    }

    // Prepare export data (exclude IDs and timestamps)
    const exportData = {
      name: script.name,
      displayName: script.displayName,
      description: script.description,
      code: script.code,
      parameters: script.parameters,
      outputs: script.outputs,
      category: script.category,
      tags: script.tags,
      requiresAuth: script.requiresAuth,
      authType: script.authType,
      credentialType: script.credentialType,
      exportedAt: new Date().toISOString(),
      exportedBy: req.user!.username,
      version: '1.0',
    };

    // Set headers for download
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${script.name}.json"`);
    res.json(exportData);
  } catch (error) {
    console.error('Export script error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Import script from JSON
scriptRouter.post('/import', requireRole(['admin', 'script_manager']), async (req: AuthRequest, res) => {
  try {
    const data = importScriptSchema.parse(req.body);

    // Check if tenant admin is trying to import as global
    const isGlobalAdmin = req.user!.roles.includes('admin');
    if (data.isGlobal && !isGlobalAdmin) {
      return res.status(403).json({
        error: 'Only global admins can import scripts as global'
      });
    }

    // If tenant admin, verify they have admin rights to the specified tenants
    if (!isGlobalAdmin && data.tenantIds && data.tenantIds.length > 0) {
      const userAdminTenantIds = Object.entries(req.user!.tenantRoles || {})
        .filter(([_, role]) => role === 'ADMIN')
        .map(([tenantId, _]) => tenantId);

      const hasAllPermissions = data.tenantIds.every(tid => userAdminTenantIds.includes(tid));
      if (!hasAllPermissions) {
        return res.status(403).json({
          error: 'You do not have admin rights to all specified tenants'
        });
      }
    }

    // Create the script
    const script = await prisma.script.create({
      data: {
        name: data.script.name,
        displayName: data.script.displayName,
        description: data.script.description,
        code: data.script.code,
        parameters: data.script.parameters || [],
        outputs: data.script.outputs || [],
        isGlobal: data.isGlobal,
        category: data.script.category,
        tags: data.script.tags || [],
        requiresAuth: data.script.requiresAuth || false,
        authType: data.script.authType || null,
        credentialType: data.script.credentialType,
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
    console.error('Import script error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
