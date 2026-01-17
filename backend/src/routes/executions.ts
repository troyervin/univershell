import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, AuthRequest, requireTenantAccess } from '../middleware/auth';
import { executePowerShellScript, executeWorkflow } from '../services/powershellExecutor';
import { initiateDeviceCodeFlowV2, pollDeviceCodeStatusV2 } from '../services/deviceCodeAuth';
import { getTenantCredential } from '../services/graphAuth';

export const executionRouter = Router();

// All routes require authentication
executionRouter.use(authenticate);

const executeScriptSchema = z.object({
  scriptId: z.string().uuid(),
  tenantId: z.string().uuid(),
  parameters: z.record(z.any()).optional(),
  accessToken: z.string().optional(), // For delegated auth
});

const executeWorkflowSchema = z.object({
  workflowId: z.string().uuid(),
  tenantId: z.string().uuid(),
  parameters: z.record(z.any()).optional(),
});

// Execute a script
executionRouter.post('/script', async (req: AuthRequest, res) => {
  try {
    const data = executeScriptSchema.parse(req.body);

    // Verify tenant access
    if (!req.user!.tenantIds.includes(data.tenantId)) {
      return res.status(403).json({ error: 'No access to this tenant' });
    }

    // Fetch script
    const script = await prisma.script.findUnique({
      where: { id: data.scriptId },
      include: {
        tenantAssignments: true,
      },
    });

    if (!script) {
      return res.status(404).json({ error: 'Script not found' });
    }

    // Verify script access
    const hasAccess =
      script.isGlobal ||
      script.tenantAssignments.some(ta => ta.tenantId === data.tenantId);

    if (!hasAccess) {
      return res.status(403).json({ error: 'Script not available for this tenant' });
    }

    // Handle authentication if required
    let accessToken: string | undefined;

    if (script.requiresAuth) {
      if (script.authType === 'APPLICATION') {
        // Fetch tenant credentials for application auth
        try {
          const credential = await prisma.tenantCredential.findFirst({
            where: {
              tenantId: data.tenantId,
              credentialType: script.credentialType || 'MICROSOFT_GRAPH',
              isActive: true,
            },
          });

          if (!credential) {
            return res.status(400).json({
              error: `No active ${script.credentialType || 'MICROSOFT_GRAPH'} credential found for this tenant`
            });
          }

          // Get access token using application credentials
          const graphAuthService = await getTenantCredential(data.tenantId, script.credentialType || 'MICROSOFT_GRAPH');
          if (!graphAuthService) {
            return res.status(400).json({
              error: 'Failed to initialize authentication service'
            });
          }

          // For APPLICATION auth, we'll pass the credential info to PowerShell
          // The script can use Connect-MgGraph or similar commands
          accessToken = 'APP_AUTH'; // Placeholder - will be handled differently
        } catch (error: any) {
          return res.status(500).json({
            error: `Authentication failed: ${error.message}`
          });
        }
      } else if (script.authType === 'DELEGATED') {
        // For delegated auth, access token must be provided
        if (!data.accessToken) {
          return res.status(400).json({
            error: 'Access token required for delegated authentication. Please complete device code flow first.'
          });
        }
        accessToken = data.accessToken;
      }
    }

    // Create execution log (PENDING)
    const executionLog = await prisma.executionLog.create({
      data: {
        userId: req.user!.userId,
        tenantId: data.tenantId,
        scriptId: data.scriptId,
        executionType: 'SCRIPT',
        status: 'PENDING',
        inputParams: data.parameters || {},
      },
    });

    // Update to RUNNING
    await prisma.executionLog.update({
      where: { id: executionLog.id },
      data: { status: 'RUNNING' },
    });

    // Execute the script
    const result = await executePowerShellScript(script.code, {
      tenantId: data.tenantId,
      userId: req.user!.userId,
      variables: data.parameters || {},
      accessToken,
    });

    // Update execution log with result
    await prisma.executionLog.update({
      where: { id: executionLog.id },
      data: {
        status: result.success ? 'SUCCESS' : 'FAILED',
        outputData: result.output,
        errorMessage: result.error,
        duration: result.duration,
        completedAt: new Date(),
      },
    });

    res.json({
      executionId: executionLog.id,
      success: result.success,
      output: result.output,
      error: result.error,
      duration: result.duration,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Execute script error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Execute a workflow
executionRouter.post('/workflow', async (req: AuthRequest, res) => {
  try {
    const data = executeWorkflowSchema.parse(req.body);

    // Verify tenant access
    if (!req.user!.tenantIds.includes(data.tenantId)) {
      return res.status(403).json({ error: 'No access to this tenant' });
    }

    // Fetch workflow
    const workflow = await prisma.workflow.findUnique({
      where: { id: data.workflowId },
    });

    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    // Verify workflow access
    const hasAccess = !workflow.tenantId || workflow.tenantId === data.tenantId;

    if (!hasAccess) {
      return res.status(403).json({ error: 'Workflow not available for this tenant' });
    }

    // Create execution log (PENDING)
    const executionLog = await prisma.executionLog.create({
      data: {
        userId: req.user!.userId,
        tenantId: data.tenantId,
        workflowId: data.workflowId,
        executionType: 'WORKFLOW',
        status: 'PENDING',
        inputParams: data.parameters || {},
      },
    });

    // Update to RUNNING
    await prisma.executionLog.update({
      where: { id: executionLog.id },
      data: { status: 'RUNNING' },
    });

    // Execute the workflow
    const result = await executeWorkflow(data.workflowId, {
      tenantId: data.tenantId,
      userId: req.user!.userId,
      variables: data.parameters || {},
    });

    // Update execution log with result
    await prisma.executionLog.update({
      where: { id: executionLog.id },
      data: {
        status: result.success ? 'SUCCESS' : 'FAILED',
        outputData: result.output,
        errorMessage: result.error,
        duration: result.duration,
        completedAt: new Date(),
      },
    });

    res.json({
      executionId: executionLog.id,
      success: result.success,
      output: result.output,
      error: result.error,
      duration: result.duration,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Execute workflow error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Device Code Flow for Delegated Authentication
 * Initiate device code flow for scripts that require delegated auth
 */
executionRouter.post('/auth/device-code/initiate', async (req: AuthRequest, res) => {
  try {
    const { scriptId, tenantId } = req.body;

    if (!scriptId || !tenantId) {
      return res.status(400).json({ error: 'scriptId and tenantId are required' });
    }

    // Verify tenant access
    if (!req.user!.tenantIds.includes(tenantId)) {
      return res.status(403).json({ error: 'No access to this tenant' });
    }

    // Fetch script to verify it requires delegated auth
    const script = await prisma.script.findUnique({
      where: { id: scriptId },
    });

    if (!script) {
      return res.status(404).json({ error: 'Script not found' });
    }

    if (!script.requiresAuth || script.authType !== 'DELEGATED') {
      return res.status(400).json({
        error: 'This script does not require delegated authentication'
      });
    }

    // Initiate device code flow
    const deviceCodeData = await initiateDeviceCodeFlowV2(
      req.user!.userId,
      tenantId
    );

    res.json(deviceCodeData);
  } catch (error: any) {
    console.error('Device code initiation error:', error);
    res.status(500).json({ error: error.message || 'Failed to initiate device code flow' });
  }
});

/**
 * Poll device code authentication status
 */
executionRouter.get('/auth/device-code/poll/:requestId', async (req: AuthRequest, res) => {
  try {
    const { requestId } = req.params;

    // Verify the request belongs to the current user
    if (!requestId.startsWith(req.user!.userId)) {
      return res.status(403).json({ error: 'Not authorized to poll this request' });
    }

    const status = await pollDeviceCodeStatusV2(requestId);
    res.json(status);
  } catch (error: any) {
    console.error('Device code polling error:', error);
    res.status(500).json({ error: error.message || 'Failed to poll device code status' });
  }
});

// Get execution history
executionRouter.get('/history', async (req: AuthRequest, res) => {
  try {
    const { tenantId, limit = '50', offset = '0' } = req.query;

    const where: any = {
      userId: req.user!.userId,
    };

    if (tenantId) {
      if (!req.user!.tenantIds.includes(tenantId as string)) {
        return res.status(403).json({ error: 'No access to this tenant' });
      }
      where.tenantId = tenantId;
    } else {
      where.tenantId = { in: req.user!.tenantIds };
    }

    const executions = await prisma.executionLog.findMany({
      where,
      include: {
        script: {
          select: {
            id: true,
            name: true,
            displayName: true,
          },
        },
        workflow: {
          select: {
            id: true,
            name: true,
            displayName: true,
          },
        },
        tenant: {
          select: {
            id: true,
            name: true,
            displayName: true,
          },
        },
      },
      orderBy: {
        startedAt: 'desc',
      },
      take: parseInt(limit as string),
      skip: parseInt(offset as string),
    });

    res.json(executions);
  } catch (error) {
    console.error('Get execution history error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get execution by ID
executionRouter.get('/:executionId', async (req: AuthRequest, res) => {
  try {
    const { executionId } = req.params;

    const execution = await prisma.executionLog.findUnique({
      where: { id: executionId },
      include: {
        script: {
          select: {
            id: true,
            name: true,
            displayName: true,
            description: true,
          },
        },
        workflow: {
          select: {
            id: true,
            name: true,
            displayName: true,
            description: true,
          },
        },
        tenant: {
          select: {
            id: true,
            name: true,
            displayName: true,
          },
        },
        user: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
      },
    });

    if (!execution) {
      return res.status(404).json({ error: 'Execution not found' });
    }

    // Verify access
    if (execution.userId !== req.user!.userId && !req.user!.roles.includes('admin')) {
      return res.status(403).json({ error: 'No access to this execution' });
    }

    res.json(execution);
  } catch (error) {
    console.error('Get execution error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
