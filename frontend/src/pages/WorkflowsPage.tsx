import { useEffect, useState } from 'react';
import { Workflow, Play } from 'lucide-react';
import api from '../lib/api';
import { useTenantStore } from '../stores/tenantStore';

interface WorkflowType {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  isActive: boolean;
  steps: any[];
}

export default function WorkflowsPage() {
  const { selectedTenant } = useTenantStore();
  const [workflows, setWorkflows] = useState<WorkflowType[]>([]);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState<string | null>(null);

  useEffect(() => {
    fetchWorkflows();
  }, [selectedTenant]);

  const fetchWorkflows = async () => {
    setLoading(true);
    try {
      const response = await api.get('/workflows', {
        params: selectedTenant ? { tenantId: selectedTenant.id } : {},
      });
      setWorkflows(response.data);
    } catch (error) {
      console.error('Failed to fetch workflows:', error);
    } finally {
      setLoading(false);
    }
  };

  const executeWorkflow = async (workflowId: string) => {
    if (!selectedTenant) {
      alert('Please select a tenant first');
      return;
    }

    setExecuting(workflowId);
    try {
      const response = await api.post('/executions/workflow', {
        workflowId,
        tenantId: selectedTenant.id,
        parameters: {},
      });

      alert(
        response.data.success
          ? `Workflow executed successfully!\n\nCompleted ${response.data.output.steps.length} steps`
          : `Workflow failed: ${response.data.error}`
      );
    } catch (error: any) {
      alert(`Execution failed: ${error.response?.data?.error || error.message}`);
    } finally {
      setExecuting(null);
    }
  };

  if (loading) {
    return <div className="text-center py-12">Loading workflows...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Workflows</h1>
          <p className="text-gray-600 mt-1">
            {selectedTenant
              ? `Available workflows for ${selectedTenant.displayName}`
              : 'All available workflows'}
          </p>
        </div>
      </div>

      {workflows.length === 0 ? (
        <div className="card text-center py-12">
          <Workflow className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500">No workflows available</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {workflows.map((workflow) => (
            <div key={workflow.id} className="card hover:shadow-lg transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-semibold text-gray-900 text-lg">
                  {workflow.displayName}
                </h3>
                <span
                  className={`px-2 py-1 text-xs rounded-full ${
                    workflow.isActive
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {workflow.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>

              {workflow.description && (
                <p className="text-sm text-gray-600 mb-4">{workflow.description}</p>
              )}

              <div className="mb-4">
                <p className="text-xs font-medium text-gray-500 mb-2">Workflow Steps:</p>
                <ol className="space-y-1">
                  {workflow.steps.map((step: any, index: number) => (
                    <li key={step.id} className="text-sm text-gray-700 flex items-start gap-2">
                      <span className="font-medium text-primary-600">{index + 1}.</span>
                      <span>{step.script.displayName}</span>
                    </li>
                  ))}
                </ol>
              </div>

              <button
                onClick={() => executeWorkflow(workflow.id)}
                disabled={!selectedTenant || !workflow.isActive || executing === workflow.id}
                className="btn btn-primary w-full flex items-center justify-center gap-2"
              >
                <Play className="w-4 h-4" />
                {executing === workflow.id ? 'Executing...' : 'Execute Workflow'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
