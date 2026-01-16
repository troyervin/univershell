import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, AuthRequest, requireRole } from '../middleware/auth';

export const roleRouter = Router();

// All routes require authentication
roleRouter.use(authenticate);

const createRoleSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  permissions: z.array(z.string()).optional(),
});

const updateRoleSchema = createRoleSchema.partial();

// Get all roles
roleRouter.get('/', async (req: AuthRequest, res) => {
  try {
    const roles = await prisma.role.findMany({
      include: {
        _count: {
          select: {
            userRoles: true,
            tenantAccess: true,
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });

    res.json(roles);
  } catch (error) {
    console.error('List roles error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get role by ID
roleRouter.get('/:roleId', async (req: AuthRequest, res) => {
  try {
    const { roleId } = req.params;

    const role = await prisma.role.findUnique({
      where: { id: roleId },
      include: {
        tenantAccess: {
          include: {
            tenant: true,
          },
        },
        userRoles: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                email: true,
              },
            },
          },
        },
      },
    });

    if (!role) {
      return res.status(404).json({ error: 'Role not found' });
    }

    res.json(role);
  } catch (error) {
    console.error('Get role error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create role (admin only)
roleRouter.post('/', requireRole(['admin']), async (req: AuthRequest, res) => {
  try {
    const data = createRoleSchema.parse(req.body);

    const role = await prisma.role.create({
      data: {
        name: data.name,
        description: data.description,
        permissions: data.permissions || [],
      },
    });

    res.status(201).json(role);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Create role error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update role (admin only)
roleRouter.patch('/:roleId', requireRole(['admin']), async (req: AuthRequest, res) => {
  try {
    const { roleId } = req.params;
    const data = updateRoleSchema.parse(req.body);

    const role = await prisma.role.update({
      where: { id: roleId },
      data,
    });

    res.json(role);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Update role error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete role (admin only)
roleRouter.delete('/:roleId', requireRole(['admin']), async (req: AuthRequest, res) => {
  try {
    const { roleId } = req.params;

    await prisma.role.delete({
      where: { id: roleId },
    });

    res.status(204).send();
  } catch (error) {
    console.error('Delete role error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default roleRouter;
