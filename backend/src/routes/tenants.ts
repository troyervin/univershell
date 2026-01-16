import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, AuthRequest, requireRole } from '../middleware/auth';

export const tenantRouter = Router();

// All routes require authentication
tenantRouter.use(authenticate);

const createTenantSchema = z.object({
  name: z.string().min(2),
  displayName: z.string().min(2),
  description: z.string().optional(),
  type: z.enum(['ACTIVE_DIRECTORY', 'MICROSOFT_365', 'HYBRID']),
  config: z.record(z.any()).optional(),
});

const updateTenantSchema = createTenantSchema.partial();

// Get all tenants the user has access to
tenantRouter.get('/', async (req: AuthRequest, res) => {
  try {
    const tenants = await prisma.tenant.findMany({
      where: {
        id: {
          in: req.user!.tenantIds,
        },
        isActive: true,
      },
      include: {
        _count: {
          select: {
            credentials: true,
            workflows: true,
            scriptAssignments: true,
          },
        },
      },
      orderBy: {
        displayName: 'asc',
      },
    });

    res.json(tenants);
  } catch (error) {
    console.error('List tenants error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get tenant by ID
tenantRouter.get('/:tenantId', async (req: AuthRequest, res) => {
  try {
    const { tenantId } = req.params;

    // Check access
    if (!req.user!.tenantIds.includes(tenantId)) {
      return res.status(403).json({ error: 'No access to this tenant' });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        credentials: {
          select: {
            id: true,
            credentialType: true,
            authType: true,
            clientId: true,
            isActive: true,
            createdAt: true,
          },
        },
        scriptAssignments: {
          include: {
            script: {
              select: {
                id: true,
                name: true,
                displayName: true,
                description: true,
              },
            },
          },
        },
        workflows: {
          select: {
            id: true,
            name: true,
            displayName: true,
            description: true,
            isActive: true,
          },
        },
      },
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    res.json(tenant);
  } catch (error) {
    console.error('Get tenant error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create tenant (admin only)
tenantRouter.post('/', requireRole(['admin']), async (req: AuthRequest, res) => {
  try {
    const data = createTenantSchema.parse(req.body);

    const tenant = await prisma.tenant.create({
      data: {
        name: data.name,
        displayName: data.displayName,
        description: data.description,
        type: data.type,
        config: data.config || {},
      },
    });

    res.status(201).json(tenant);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Create tenant error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update tenant (admin only)
tenantRouter.patch('/:tenantId', requireRole(['admin']), async (req: AuthRequest, res) => {
  try {
    const { tenantId } = req.params;
    const data = updateTenantSchema.parse(req.body);

    const tenant = await prisma.tenant.update({
      where: { id: tenantId },
      data,
    });

    res.json(tenant);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Update tenant error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete tenant (admin only)
tenantRouter.delete('/:tenantId', requireRole(['admin']), async (req: AuthRequest, res) => {
  try {
    const { tenantId } = req.params;

    await prisma.tenant.delete({
      where: { id: tenantId },
    });

    res.status(204).send();
  } catch (error) {
    console.error('Delete tenant error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Grant role access to tenant (admin only)
const grantAccessSchema = z.object({
  roleId: z.string().uuid(),
  tenantId: z.string().uuid(),
});

tenantRouter.post('/grant-access', requireRole(['admin']), async (req: AuthRequest, res) => {
  try {
    const data = grantAccessSchema.parse(req.body);

    const tenantAccess = await prisma.tenantAccess.create({
      data: {
        roleId: data.roleId,
        tenantId: data.tenantId,
      },
      include: {
        role: true,
        tenant: true,
      },
    });

    res.status(201).json(tenantAccess);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Grant access error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Revoke role access from tenant (admin only)
tenantRouter.delete('/revoke-access', requireRole(['admin']), async (req: AuthRequest, res) => {
  try {
    const data = grantAccessSchema.parse(req.body);

    await prisma.tenantAccess.delete({
      where: {
        roleId_tenantId: {
          roleId: data.roleId,
          tenantId: data.tenantId,
        },
      },
    });

    res.status(204).send();
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Revoke access error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
