import { spawn } from 'child_process';
import { prisma } from '../lib/prisma';

export interface ExecutionResult {
  success: boolean;
  output: any;
  error?: string;
  duration: number;
}

export interface ExecutionContext {
  tenantId: string;
  userId: string;
  variables: Record<string, any>;
  timeout?: number;
}

/**
 * Executes a PowerShell script with the given context
 */
export async function executePowerShellScript(
  scriptCode: string,
  context: ExecutionContext
): Promise<ExecutionResult> {
  const startTime = Date.now();
  const timeout = context.timeout || parseInt(process.env.POWERSHELL_TIMEOUT || '300000');

  return new Promise((resolve) => {
    let output = '';
    let errorOutput = '';

    // Prepare the script with variable injection
    const preparedScript = injectVariables(scriptCode, context.variables);

    // Spawn PowerShell process
    const ps = spawn('pwsh', ['-NoProfile', '-Command', preparedScript], {
      timeout,
      env: {
        ...process.env,
        UNIVERSHELL_TENANT_ID: context.tenantId,
        UNIVERSHELL_USER_ID: context.userId,
      },
    });

    // Collect stdout
    ps.stdout.on('data', (data) => {
      output += data.toString();
    });

    // Collect stderr
    ps.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    // Handle process completion
    ps.on('close', (code) => {
      const duration = Date.now() - startTime;

      if (code === 0) {
        // Try to parse output as JSON if possible
        let parsedOutput: any;
        try {
          parsedOutput = JSON.parse(output);
        } catch {
          parsedOutput = output.trim();
        }

        resolve({
          success: true,
          output: parsedOutput,
          duration,
        });
      } else {
        resolve({
          success: false,
          output: output.trim(),
          error: errorOutput.trim() || `Process exited with code ${code}`,
          duration,
        });
      }
    });

    // Handle errors
    ps.on('error', (error) => {
      const duration = Date.now() - startTime;
      resolve({
        success: false,
        output: output.trim(),
        error: error.message,
        duration,
      });
    });
  });
}

/**
 * Injects variables into the PowerShell script
 */
function injectVariables(
  scriptCode: string,
  variables: Record<string, any>
): string {
  // Create PowerShell variable declarations
  const variableDeclarations = Object.entries(variables)
    .map(([key, value]) => {
      const psValue = convertToPowerShellValue(value);
      return `$${key} = ${psValue}`;
    })
    .join('\n');

  // Prepend variable declarations to the script
  return `${variableDeclarations}\n\n${scriptCode}`;
}

/**
 * Converts JavaScript values to PowerShell syntax
 */
function convertToPowerShellValue(value: any): string {
  if (value === null || value === undefined) {
    return '$null';
  }

  if (typeof value === 'string') {
    // Escape single quotes and wrap in single quotes
    return `'${value.replace(/'/g, "''")}'`;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    const items = value.map(convertToPowerShellValue).join(', ');
    return `@(${items})`;
  }

  if (typeof value === 'object') {
    // Convert to hashtable
    const entries = Object.entries(value)
      .map(([k, v]) => `${k} = ${convertToPowerShellValue(v)}`)
      .join('; ');
    return `@{${entries}}`;
  }

  return String(value);
}

/**
 * Executes a workflow with multiple script steps
 */
export async function executeWorkflow(
  workflowId: string,
  context: ExecutionContext
): Promise<ExecutionResult> {
  const startTime = Date.now();

  try {
    // Fetch workflow with steps
    const workflow = await prisma.workflow.findUnique({
      where: { id: workflowId },
      include: {
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

    if (!workflow) {
      return {
        success: false,
        output: null,
        error: 'Workflow not found',
        duration: Date.now() - startTime,
      };
    }

    // Execute steps sequentially
    const stepResults: any[] = [];
    let workflowVariables = { ...context.variables };

    for (const step of workflow.steps) {
      console.log(`Executing workflow step ${step.order}: ${step.script.name}`);

      // Execute the script
      const result = await executePowerShellScript(step.script.code, {
        ...context,
        variables: workflowVariables,
      });

      stepResults.push({
        step: step.order,
        scriptName: step.script.name,
        success: result.success,
        output: result.output,
        error: result.error,
        duration: result.duration,
      });

      // If step failed and continueOnError is false, stop the workflow
      if (!result.success && !step.continueOnError) {
        return {
          success: false,
          output: {
            completedSteps: stepResults,
            failedAt: step.order,
          },
          error: `Workflow failed at step ${step.order}: ${result.error}`,
          duration: Date.now() - startTime,
        };
      }

      // Apply variable mapping for next step
      if (result.success && step.variableMapping) {
        const mapping = step.variableMapping as Record<string, string>;
        Object.entries(mapping).forEach(([outputVar, inputVar]) => {
          if (typeof result.output === 'object' && result.output[outputVar] !== undefined) {
            workflowVariables[inputVar] = result.output[outputVar];
          }
        });
      }

      // If output is an object, merge all properties into workflow variables
      if (result.success && typeof result.output === 'object' && !Array.isArray(result.output)) {
        workflowVariables = {
          ...workflowVariables,
          ...result.output,
        };
      }
    }

    return {
      success: true,
      output: {
        steps: stepResults,
        finalVariables: workflowVariables,
      },
      duration: Date.now() - startTime,
    };
  } catch (error: any) {
    return {
      success: false,
      output: null,
      error: error.message,
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Validates that PowerShell is available
 */
export async function validatePowerShellAvailability(): Promise<boolean> {
  try {
    const result = await executePowerShellScript('$PSVersionTable.PSVersion | ConvertTo-Json', {
      tenantId: 'system',
      userId: 'system',
      variables: {},
      timeout: 5000,
    });
    return result.success;
  } catch {
    return false;
  }
}
