import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, AuthRequest, requireTenantAdmin, requireGlobalAdmin } from '../middleware/auth';

export const tenantAdminRouter = Router();

// All routes require authentication
tenantAdminRouter.use(authenticate);

// ============================================
// Tenant User Management
// ============================================

const addTenantUserSchema = z.object({
  userId: z.string().uuid(),
  tenantId: z.string().uuid(),
  role: z.enum(['ADMIN', 'USER']).default('USER'),
});

// Get all users in a tenant (Tenant Admin or Global Admin)
tenantAdminRouter.get('/:tenantId/users', async (req: AuthRequest, res) => {
  try {
    const { tenantId } = req.params;

    // Check if user is tenant admin or global admin
    const isTenantAdmin = await checkTenantAdmin(req.user!.userId, tenantId);
    const isGlobalAdmin = req.user!.roles.includes('admin');

    if (!isTenantAdmin && !isGlobalAdmin) {
      return res.status(403).json({ error: 'Must be tenant admin or global admin' });
    }

    const tenantUsers = await prisma.tenantUser.findMany({
      where: { tenantId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true,
            firstName: true,
            lastName: true,
            isActive: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.json(tenantUsers);
  } catch (error) {
    console.error('Get tenant users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add user to tenant (Tenant Admin or Global Admin)
tenantAdminRouter.post('/:tenantId/users', async (req: AuthRequest, res) => {
  try {
    const { tenantId } = req.params;
    const data = addTenantUserSchema.parse(req.body);

    // Check if user is tenant admin or global admin
    const isTenantAdmin = await checkTenantAdmin(req.user!.userId, tenantId);
    const isGlobalAdmin = req.user!.roles.includes('admin');

    if (!isTenantAdmin && !isGlobalAdmin) {
      return res.status(403).json({ error: 'Must be tenant admin or global admin' });
    }

    // Verify the user exists
    const user = await prisma.user.findUnique({
      where: { id: data.userId },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if already added
    const existing = await prisma.tenantUser.findUnique({
      where: {
        userId_tenantId: {
          userId: data.userId,
          tenantId: data.tenantId,
        },
      },
    });

    if (existing) {
      return res.status(400).json({ error: 'User already added to tenant' });
    }

    const tenantUser = await prisma.tenantUser.create({
      data: {
        userId: data.userId,
        tenantId: data.tenantId,
        role: data.role,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    res.status(201).json(tenantUser);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Add tenant user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update tenant user role (Tenant Admin or Global Admin)
tenantAdminRouter.patch('/:tenantId/users/:userId', async (req: AuthRequest, res) => {
  try {
    const { tenantId, userId } = req.params;
    const { role } = z.object({ role: z.enum(['ADMIN', 'USER']) }).parse(req.body);

    // Check if user is tenant admin or global admin
    const isTenantAdmin = await checkTenantAdmin(req.user!.userId, tenantId);
    const isGlobalAdmin = req.user!.roles.includes('admin');

    if (!isTenantAdmin && !isGlobalAdmin) {
      return res.status(403).json({ error: 'Must be tenant admin or global admin' });
    }

    const tenantUser = await prisma.tenantUser.update({
      where: {
        userId_tenantId: {
          userId,
          tenantId,
        },
      },
      data: { role },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    res.json(tenantUser);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Update tenant user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Remove user from tenant (Tenant Admin or Global Admin)
tenantAdminRouter.delete('/:tenantId/users/:userId', async (req: AuthRequest, res) => {
  try {
    const { tenantId, userId } = req.params;

    // Check if user is tenant admin or global admin
    const isTenantAdmin = await checkTenantAdmin(req.user!.userId, tenantId);
    const isGlobalAdmin = req.user!.roles.includes('admin');

    if (!isTenantAdmin && !isGlobalAdmin) {
      return res.status(403).json({ error: 'Must be tenant admin or global admin' });
    }

    await prisma.tenantUser.delete({
      where: {
        userId_tenantId: {
          userId,
          tenantId,
        },
      },
    });

    res.status(204).send();
  } catch (error) {
    console.error('Remove tenant user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================
// Tenant Group Management
// ============================================

const createGroupSchema = z.object({
  name: z.string().min(2),
  displayName: z.string().min(2),
  description: z.string().optional(),
});

// Get all groups in a tenant
tenantAdminRouter.get('/:tenantId/groups', async (req: AuthRequest, res) => {
  try {
    const { tenantId } = req.params;

    // Check if user has access to tenant
    const isTenantAdmin = await checkTenantAdmin(req.user!.userId, tenantId);
    const isGlobalAdmin = req.user!.roles.includes('admin');
    const hasTenantAccess = req.user!.tenantIds.includes(tenantId);

    if (!isTenantAdmin && !isGlobalAdmin && !hasTenantAccess) {
      return res.status(403).json({ error: 'No access to this tenant' });
    }

    const groups = await prisma.tenantGroup.findMany({
      where: { tenantId },
      include: {
        _count: {
          select: {
            members: true,
            scriptAssignments: true,
            workflowAssignments: true,
          },
        },
      },
      orderBy: {
        displayName: 'asc',
      },
    });

    res.json(groups);
  } catch (error) {
    console.error('Get groups error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get group by ID with members and assignments
tenantAdminRouter.get('/:tenantId/groups/:groupId', async (req: AuthRequest, res) => {
  try {
    const { tenantId, groupId } = req.params;

    const group = await prisma.tenantGroup.findFirst({
      where: {
        id: groupId,
        tenantId,
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
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
                category: true,
              },
            },
          },
        },
        workflowAssignments: {
          include: {
            workflow: {
              select: {
                id: true,
                name: true,
                displayName: true,
                description: true,
              },
            },
          },
        },
      },
    });

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    res.json(group);
  } catch (error) {
    console.error('Get group error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create group (Tenant Admin only)
tenantAdminRouter.post('/:tenantId/groups', async (req: AuthRequest, res) => {
  try {
    const { tenantId } = req.params;
    const data = createGroupSchema.parse(req.body);

    // Check if user is tenant admin or global admin
    const isTenantAdmin = await checkTenantAdmin(req.user!.userId, tenantId);
    const isGlobalAdmin = req.user!.roles.includes('admin');

    if (!isTenantAdmin && !isGlobalAdmin) {
      return res.status(403).json({ error: 'Must be tenant admin or global admin' });
    }

    const group = await prisma.tenantGroup.create({
      data: {
        tenantId,
        name: data.name,
        displayName: data.displayName,
        description: data.description,
      },
    });

    res.status(201).json(group);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Create group error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update group (Tenant Admin only)
tenantAdminRouter.patch('/:tenantId/groups/:groupId', async (req: AuthRequest, res) => {
  try {
    const { tenantId, groupId } = req.params;
    const data = createGroupSchema.partial().parse(req.body);

    // Check if user is tenant admin or global admin
    const isTenantAdmin = await checkTenantAdmin(req.user!.userId, tenantId);
    const isGlobalAdmin = req.user!.roles.includes('admin');

    if (!isTenantAdmin && !isGlobalAdmin) {
      return res.status(403).json({ error: 'Must be tenant admin or global admin' });
    }

    const group = await prisma.tenantGroup.updateMany({
      where: {
        id: groupId,
        tenantId,
      },
      data,
    });

    res.json(group);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Update group error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete group (Tenant Admin only)
tenantAdminRouter.delete('/:tenantId/groups/:groupId', async (req: AuthRequest, res) => {
  try {
    const { tenantId, groupId } = req.params;

    // Check if user is tenant admin or global admin
    const isTenantAdmin = await checkTenantAdmin(req.user!.userId, tenantId);
    const isGlobalAdmin = req.user!.roles.includes('admin');

    if (!isTenantAdmin && !isGlobalAdmin) {
      return res.status(403).json({ error: 'Must be tenant admin or global admin' });
    }

    await prisma.tenantGroup.deleteMany({
      where: {
        id: groupId,
        tenantId,
      },
    });

    res.status(204).send();
  } catch (error) {
    console.error('Delete group error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================
// Group Member Management
// ============================================

const addGroupMemberSchema = z.object({
  userId: z.string().uuid(),
});

// Add user to group
tenantAdminRouter.post('/:tenantId/groups/:groupId/members', async (req: AuthRequest, res) => {
  try {
    const { tenantId, groupId } = req.params;
    const data = addGroupMemberSchema.parse(req.body);

    // Check if user is tenant admin or global admin
    const isTenantAdmin = await checkTenantAdmin(req.user!.userId, tenantId);
    const isGlobalAdmin = req.user!.roles.includes('admin');

    if (!isTenantAdmin && !isGlobalAdmin) {
      return res.status(403).json({ error: 'Must be tenant admin or global admin' });
    }

    // Verify group belongs to tenant
    const group = await prisma.tenantGroup.findFirst({
      where: { id: groupId, tenantId },
    });

    if (!group) {
      return res.status(404).json({ error: 'Group not found in this tenant' });
    }

    // Verify user is in tenant
    const tenantUser = await prisma.tenantUser.findFirst({
      where: {
        userId: data.userId,
        tenantId,
      },
    });

    if (!tenantUser) {
      return res.status(400).json({ error: 'User must be added to tenant first' });
    }

    const member = await prisma.tenantGroupMember.create({
      data: {
        groupId,
        userId: data.userId,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    res.status(201).json(member);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Add group member error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Remove user from group
tenantAdminRouter.delete('/:tenantId/groups/:groupId/members/:userId', async (req: AuthRequest, res) => {
  try {
    const { tenantId, groupId, userId } = req.params;

    // Check if user is tenant admin or global admin
    const isTenantAdmin = await checkTenantAdmin(req.user!.userId, tenantId);
    const isGlobalAdmin = req.user!.roles.includes('admin');

    if (!isTenantAdmin && !isGlobalAdmin) {
      return res.status(403).json({ error: 'Must be tenant admin or global admin' });
    }

    await prisma.tenantGroupMember.delete({
      where: {
        groupId_userId: {
          groupId,
          userId,
        },
      },
    });

    res.status(204).send();
  } catch (error) {
    console.error('Remove group member error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================
// Helper Functions
// ============================================

async function checkTenantAdmin(userId: string, tenantId: string): Promise<boolean> {
  const tenantUser = await prisma.tenantUser.findUnique({
    where: {
      userId_tenantId: {
        userId,
        tenantId,
      },
    },
  });

  return tenantUser?.role === 'ADMIN';
}
