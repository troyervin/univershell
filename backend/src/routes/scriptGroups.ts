import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, AuthRequest, requireTenantAdmin } from '../middleware/auth';

export const scriptGroupRouter = Router();

// All routes require authentication
scriptGroupRouter.use(authenticate);

// ============================================
// Script-to-Group Assignment
// ============================================

const assignScriptToGroupSchema = z.object({
  scriptId: z.string().uuid(),
  groupId: z.string().uuid(),
  config: z.record(z.any()).optional(),
});

// Assign script to group (Tenant Admin only)
scriptGroupRouter.post('/assign', async (req: AuthRequest, res) => {
  try {
    const data = assignScriptToGroupSchema.parse(req.body);

    // Get group to verify tenant
    const group = await prisma.tenantGroup.findUnique({
      where: { id: data.groupId },
      include: { tenant: true },
    });

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Check if user is tenant admin or global admin
    const isTenantAdmin = req.user!.tenantRoles[group.tenantId] === 'ADMIN';
    const isGlobalAdmin = req.user!.roles.includes('admin');

    if (!isTenantAdmin && !isGlobalAdmin) {
      return res.status(403).json({ error: 'Must be tenant admin or global admin' });
    }

    // Verify script exists and is available for this tenant
    const script = await prisma.script.findUnique({
      where: { id: data.scriptId },
      include: {
        tenantAssignments: true,
      },
    });

    if (!script) {
      return res.status(404).json({ error: 'Script not found' });
    }

    // Check if script is global or assigned to this tenant
    const scriptAvailable =
      script.isGlobal ||
      script.tenantAssignments.some(ta => ta.tenantId === group.tenantId);

    if (!scriptAvailable) {
      return res.status(400).json({ error: 'Script not available for this tenant' });
    }

    const assignment = await prisma.scriptGroupAssignment.create({
      data: {
        scriptId: data.scriptId,
        groupId: data.groupId,
        config: data.config || {},
      },
      include: {
        script: {
          select: {
            id: true,
            name: true,
            displayName: true,
            description: true,
          },
        },
        group: {
          select: {
            id: true,
            name: true,
            displayName: true,
          },
        },
      },
    });

    res.status(201).json(assignment);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Assign script to group error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Unassign script from group (Tenant Admin only)
scriptGroupRouter.delete('/unassign', async (req: AuthRequest, res) => {
  try {
    const { scriptId, groupId } = assignScriptToGroupSchema.parse(req.body);

    // Get group to verify tenant
    const group = await prisma.tenantGroup.findUnique({
      where: { id: groupId },
    });

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Check if user is tenant admin or global admin
    const isTenantAdmin = req.user!.tenantRoles[group.tenantId] === 'ADMIN';
    const isGlobalAdmin = req.user!.roles.includes('admin');

    if (!isTenantAdmin && !isGlobalAdmin) {
      return res.status(403).json({ error: 'Must be tenant admin or global admin' });
    }

    await prisma.scriptGroupAssignment.delete({
      where: {
        scriptId_groupId: {
          scriptId,
          groupId,
        },
      },
    });

    res.status(204).send();
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Unassign script from group error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all scripts available to a specific group
scriptGroupRouter.get('/group/:groupId/scripts', async (req: AuthRequest, res) => {
  try {
    const { groupId } = req.params;

    // Get group to verify tenant access
    const group = await prisma.tenantGroup.findUnique({
      where: { id: groupId },
      include: {
        scriptAssignments: {
          include: {
            script: {
              include: {
                creator: {
                  select: {
                    id: true,
                    username: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Check if user has access to this tenant
    if (!req.user!.tenantIds.includes(group.tenantId)) {
      return res.status(403).json({ error: 'No access to this tenant' });
    }

    res.json(group.scriptAssignments);
  } catch (error) {
    console.error('Get group scripts error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all scripts available to current user (based on their group memberships)
scriptGroupRouter.get('/my-scripts', async (req: AuthRequest, res) => {
  try {
    const { tenantId } = req.query;

    // Get user's group memberships
    const groupMemberships = await prisma.tenantGroupMember.findMany({
      where: {
        userId: req.user!.userId,
        ...(tenantId && {
          group: {
            tenantId: tenantId as string,
          },
        }),
      },
      include: {
        group: {
          include: {
            scriptAssignments: {
              include: {
                script: {
                  include: {
                    creator: {
                      select: {
                        id: true,
                        username: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    // Extract unique scripts
    const scriptsMap = new Map();
    groupMemberships.forEach(membership => {
      membership.group.scriptAssignments.forEach(assignment => {
        if (!scriptsMap.has(assignment.script.id)) {
          scriptsMap.set(assignment.script.id, {
            ...assignment.script,
            assignedViaGroups: [],
          });
        }
        scriptsMap.get(assignment.script.id).assignedViaGroups.push({
          groupId: membership.group.id,
          groupName: membership.group.displayName,
        });
      });
    });

    const scripts = Array.from(scriptsMap.values());

    res.json(scripts);
  } catch (error) {
    console.error('Get my scripts error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================
// Workflow-to-Group Assignment
// ============================================

const assignWorkflowToGroupSchema = z.object({
  workflowId: z.string().uuid(),
  groupId: z.string().uuid(),
  config: z.record(z.any()).optional(),
});

// Assign workflow to group (Tenant Admin only)
scriptGroupRouter.post('/assign-workflow', async (req: AuthRequest, res) => {
  try {
    const data = assignWorkflowToGroupSchema.parse(req.body);

    // Get group to verify tenant
    const group = await prisma.tenantGroup.findUnique({
      where: { id: data.groupId },
    });

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Check if user is tenant admin or global admin
    const isTenantAdmin = req.user!.tenantRoles[group.tenantId] === 'ADMIN';
    const isGlobalAdmin = req.user!.roles.includes('admin');

    if (!isTenantAdmin && !isGlobalAdmin) {
      return res.status(403).json({ error: 'Must be tenant admin or global admin' });
    }

    // Verify workflow exists and is available for this tenant
    const workflow = await prisma.workflow.findUnique({
      where: { id: data.workflowId },
    });

    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    // Check if workflow is global or for this tenant
    const workflowAvailable = !workflow.tenantId || workflow.tenantId === group.tenantId;

    if (!workflowAvailable) {
      return res.status(400).json({ error: 'Workflow not available for this tenant' });
    }

    const assignment = await prisma.workflowGroupAssignment.create({
      data: {
        workflowId: data.workflowId,
        groupId: data.groupId,
        config: data.config || {},
      },
      include: {
        workflow: {
          select: {
            id: true,
            name: true,
            displayName: true,
            description: true,
          },
        },
        group: {
          select: {
            id: true,
            name: true,
            displayName: true,
          },
        },
      },
    });

    res.status(201).json(assignment);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Assign workflow to group error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Unassign workflow from group (Tenant Admin only)
scriptGroupRouter.delete('/unassign-workflow', async (req: AuthRequest, res) => {
  try {
    const { workflowId, groupId } = assignWorkflowToGroupSchema.parse(req.body);

    // Get group to verify tenant
    const group = await prisma.tenantGroup.findUnique({
      where: { id: groupId },
    });

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Check if user is tenant admin or global admin
    const isTenantAdmin = req.user!.tenantRoles[group.tenantId] === 'ADMIN';
    const isGlobalAdmin = req.user!.roles.includes('admin');

    if (!isTenantAdmin && !isGlobalAdmin) {
      return res.status(403).json({ error: 'Must be tenant admin or global admin' });
    }

    await prisma.workflowGroupAssignment.delete({
      where: {
        workflowId_groupId: {
          workflowId,
          groupId,
        },
      },
    });

    res.status(204).send();
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Unassign workflow from group error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
