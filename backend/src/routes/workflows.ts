import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, AuthRequest, requireRole } from '../middleware/auth';

export const workflowRouter = Router();

// All routes require authentication
workflowRouter.use(authenticate);

const createWorkflowSchema = z.object({
  name: z.string().min(2),
  displayName: z.string().min(2),
  description: z.string().optional(),
  tenantId: z.string().uuid().optional(),
  steps: z.array(
    z.object({
      scriptId: z.string().uuid(),
      order: z.number().int().min(1),
      variableMapping: z.record(z.any()).optional(),
      continueOnError: z.boolean().default(false),
    })
  ).min(1),
});

const updateWorkflowSchema = z.object({
  name: z.string().min(2).optional(),
  displayName: z.string().min(2).optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
});

// Get all workflows available to user
workflowRouter.get('/', async (req: AuthRequest, res) => {
  try {
    const { tenantId } = req.query;

    const workflows = await prisma.workflow.findMany({
      where: {
        OR: [
          { tenantId: null }, // Global workflows
          {
            tenantId: {
              in: req.user!.tenantIds,
            },
          },
        ],
        ...(tenantId && { tenantId: tenantId as string }),
      },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            displayName: true,
          },
        },
        steps: {
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
          orderBy: {
            order: 'asc',
          },
        },
        _count: {
          select: {
            executionLogs: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.json(workflows);
  } catch (error) {
    console.error('List workflows error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get workflow by ID
workflowRouter.get('/:workflowId', async (req: AuthRequest, res) => {
  try {
    const { workflowId } = req.params;

    const workflow = await prisma.workflow.findUnique({
      where: { id: workflowId },
      include: {
        tenant: true,
        steps: {
          include: {
            script: {
              select: {
                id: true,
                name: true,
                displayName: true,
                description: true,
                parameters: true,
                outputs: true,
              },
            },
          },
          orderBy: {
            order: 'asc',
          },
        },
      },
    });

    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    // Check access
    const hasAccess =
      !workflow.tenantId || req.user!.tenantIds.includes(workflow.tenantId);

    if (!hasAccess) {
      return res.status(403).json({ error: 'No access to this workflow' });
    }

    res.json(workflow);
  } catch (error) {
    console.error('Get workflow error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create workflow (admin or workflow_manager role)
workflowRouter.post('/', requireRole(['admin', 'workflow_manager']), async (req: AuthRequest, res) => {
  try {
    const data = createWorkflowSchema.parse(req.body);

    // Verify tenant access if tenantId provided
    if (data.tenantId && !req.user!.tenantIds.includes(data.tenantId)) {
      return res.status(403).json({ error: 'No access to this tenant' });
    }

    // Create workflow with steps in a transaction
    const workflow = await prisma.$transaction(async (tx) => {
      const wf = await tx.workflow.create({
        data: {
          name: data.name,
          displayName: data.displayName,
          description: data.description,
          tenantId: data.tenantId,
        },
      });

      // Create workflow steps
      await tx.workflowStep.createMany({
        data: data.steps.map(step => ({
          workflowId: wf.id,
          scriptId: step.scriptId,
          order: step.order,
          variableMapping: step.variableMapping || {},
          continueOnError: step.continueOnError,
        })),
      });

      return wf;
    });

    // Fetch complete workflow with relations
    const completeWorkflow = await prisma.workflow.findUnique({
      where: { id: workflow.id },
      include: {
        tenant: true,
        steps: {
          include: {
            script: true,
          },
          orderBy: {
            order: 'asc',
          },
        },
      },
    });

    res.status(201).json(completeWorkflow);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Create workflow error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update workflow (admin or workflow_manager role)
workflowRouter.patch('/:workflowId', requireRole(['admin', 'workflow_manager']), async (req: AuthRequest, res) => {
  try {
    const { workflowId } = req.params;
    const data = updateWorkflowSchema.parse(req.body);

    const workflow = await prisma.workflow.update({
      where: { id: workflowId },
      data,
      include: {
        tenant: true,
        steps: {
          include: {
            script: true,
          },
          orderBy: {
            order: 'asc',
          },
        },
      },
    });

    res.json(workflow);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Update workflow error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete workflow (admin only)
workflowRouter.delete('/:workflowId', requireRole(['admin']), async (req: AuthRequest, res) => {
  try {
    const { workflowId } = req.params;

    await prisma.workflow.delete({
      where: { id: workflowId },
    });

    res.status(204).send();
  } catch (error) {
    console.error('Delete workflow error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update workflow steps (admin or workflow_manager role)
const updateStepsSchema = z.object({
  steps: z.array(
    z.object({
      scriptId: z.string().uuid(),
      order: z.number().int().min(1),
      variableMapping: z.record(z.any()).optional(),
      continueOnError: z.boolean().default(false),
    })
  ).min(1),
});

workflowRouter.put('/:workflowId/steps', requireRole(['admin', 'workflow_manager']), async (req: AuthRequest, res) => {
  try {
    const { workflowId } = req.params;
    const data = updateStepsSchema.parse(req.body);

    // Update steps in a transaction
    const workflow = await prisma.$transaction(async (tx) => {
      // Delete existing steps
      await tx.workflowStep.deleteMany({
        where: { workflowId },
      });

      // Create new steps
      await tx.workflowStep.createMany({
        data: data.steps.map(step => ({
          workflowId,
          scriptId: step.scriptId,
          order: step.order,
          variableMapping: step.variableMapping || {},
          continueOnError: step.continueOnError,
        })),
      });

      // Return updated workflow
      return tx.workflow.findUnique({
        where: { id: workflowId },
        include: {
          tenant: true,
          steps: {
            include: {
              script: true,
            },
            orderBy: {
              order: 'asc',
            },
          },
        },
      });
    });

    res.json(workflow);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Update workflow steps error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
