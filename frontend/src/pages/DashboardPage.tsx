import { useEffect, useState } from 'react';
import { FileCode, Workflow, PlayCircle, Clock } from 'lucide-react';
import api from '../lib/api';
import { useTenantStore } from '../stores/tenantStore';

interface Stats {
  scripts: number;
  workflows: number;
  executions: number;
  recentExecutions: any[];
}

export default function DashboardPage() {
  const { selectedTenant } = useTenantStore();
  const [stats, setStats] = useState<Stats>({
    scripts: 0,
    workflows: 0,
    executions: 0,
    recentExecutions: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, [selectedTenant]);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const [scriptsRes, workflowsRes, executionsRes] = await Promise.all([
        api.get('/scripts', {
          params: selectedTenant ? { tenantId: selectedTenant.id } : {},
        }),
        api.get('/workflows', {
          params: selectedTenant ? { tenantId: selectedTenant.id } : {},
        }),
        api.get('/executions/history', {
          params: { limit: 5, ...(selectedTenant ? { tenantId: selectedTenant.id } : {}) },
        }),
      ]);

      setStats({
        scripts: scriptsRes.data.length,
        workflows: workflowsRes.data.length,
        executions: executionsRes.data.length,
        recentExecutions: executionsRes.data,
      });
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    { label: 'Scripts', value: stats.scripts, icon: FileCode, color: 'bg-blue-500' },
    { label: 'Workflows', value: stats.workflows, icon: Workflow, color: 'bg-purple-500' },
    { label: 'Executions', value: stats.executions, icon: PlayCircle, color: 'bg-green-500' },
  ];

  if (loading) {
    return <div className="text-center py-12">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 mt-1">
          {selectedTenant
            ? `Viewing ${selectedTenant.displayName}`
            : 'Overview of all tenants'}
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {statCards.map((stat) => (
          <div key={stat.label} className="card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">{stat.label}</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{stat.value}</p>
              </div>
              <div className={`${stat.color} p-3 rounded-lg`}>
                <stat.icon className="w-6 h-6 text-white" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Recent Executions */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-5 h-5 text-gray-600" />
          <h2 className="text-lg font-semibold text-gray-900">Recent Executions</h2>
        </div>

        {stats.recentExecutions.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No executions yet</p>
        ) : (
          <div className="space-y-3">
            {stats.recentExecutions.map((execution) => (
              <div
                key={execution.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-md"
              >
                <div className="flex-1">
                  <p className="font-medium text-gray-900">
                    {execution.script?.displayName || execution.workflow?.displayName}
                  </p>
                  <p className="text-sm text-gray-500">
                    {new Date(execution.startedAt).toLocaleString()}
                  </p>
                </div>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-medium ${
                    execution.status === 'SUCCESS'
                      ? 'bg-green-100 text-green-800'
                      : execution.status === 'FAILED'
                      ? 'bg-red-100 text-red-800'
                      : 'bg-yellow-100 text-yellow-800'
                  }`}
                >
                  {execution.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
