import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, AuthRequest, requireRole } from '../middleware/auth';

export const userRouter = Router();

// All routes require authentication
userRouter.use(authenticate);

// Get current user profile
userRouter.get('/me', async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: {
        id: true,
        username: true,
        email: true,
        firstName: true,
        lastName: true,
        isActive: true,
        createdAt: true,
        userRoles: {
          include: {
            role: {
              include: {
                tenantAccess: {
                  include: {
                    tenant: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// List all users (admin only)
userRouter.get('/', requireRole(['admin']), async (req: AuthRequest, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        email: true,
        firstName: true,
        lastName: true,
        isActive: true,
        createdAt: true,
        userRoles: {
          include: {
            role: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.json(users);
  } catch (error) {
    console.error('List users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Assign role to user (admin only)
const assignRoleSchema = z.object({
  userId: z.string().uuid(),
  roleId: z.string().uuid(),
});

userRouter.post('/assign-role', requireRole(['admin']), async (req: AuthRequest, res) => {
  try {
    const data = assignRoleSchema.parse(req.body);

    const userRole = await prisma.userRole.create({
      data: {
        userId: data.userId,
        roleId: data.roleId,
      },
      include: {
        user: true,
        role: true,
      },
    });

    res.status(201).json(userRole);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Assign role error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Remove role from user (admin only)
userRouter.delete('/remove-role', requireRole(['admin']), async (req: AuthRequest, res) => {
  try {
    const data = assignRoleSchema.parse(req.body);

    await prisma.userRole.delete({
      where: {
        userId_roleId: {
          userId: data.userId,
          roleId: data.roleId,
        },
      },
    });

    res.status(204).send();
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Remove role error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
