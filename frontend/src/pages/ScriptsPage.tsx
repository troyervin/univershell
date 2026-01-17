import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileCode, Play, Tag, Plus, Edit } from 'lucide-react';
import api from '../lib/api';
import { useTenantStore } from '../stores/tenantStore';
import { useAuthStore } from '../stores/authStore';
import ExecutionModal from '../components/ExecutionModal';

interface Script {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  category?: string;
  tags: string[];
  isGlobal: boolean;
  parameters: any[];
  requiresAuth: boolean;
  authType: 'APPLICATION' | 'DELEGATED' | null;
  credentialType?: string;
}

export default function ScriptsPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { selectedTenant } = useTenantStore();
  const [scripts, setScripts] = useState<Script[]>([]);
  const [loading, setLoading] = useState(true);
  const [executionModal, setExecutionModal] = useState<{
    isOpen: boolean;
    script: Script | null;
  }>({ isOpen: false, script: null });

  const canManageScripts = user?.roles?.includes('admin') || user?.roles?.includes('script_manager');

  useEffect(() => {
    fetchScripts();
  }, [selectedTenant]);

  const fetchScripts = async () => {
    setLoading(true);
    try {
      const response = await api.get('/scripts', {
        params: selectedTenant ? { tenantId: selectedTenant.id } : {},
      });
      setScripts(response.data);
    } catch (error) {
      console.error('Failed to fetch scripts:', error);
    } finally {
      setLoading(false);
    }
  };

  const openExecutionModal = (script: Script) => {
    if (!selectedTenant) {
      alert('Please select a tenant first');
      return;
    }

    setExecutionModal({
      isOpen: true,
      script,
    });
  };

  const closeExecutionModal = () => {
    setExecutionModal({
      isOpen: false,
      script: null,
    });
  };

  if (loading) {
    return <div className="text-center py-12">Loading scripts...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Scripts</h1>
          <p className="text-gray-600 mt-1">
            {selectedTenant
              ? `Available scripts for ${selectedTenant.displayName}`
              : 'All available scripts'}
          </p>
        </div>
        {canManageScripts && (
          <button
            onClick={() => navigate('/scripts/new')}
            className="btn btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Create Script
          </button>
        )}
        </div>
      </div>

      {scripts.length === 0 ? (
        <div className="card text-center py-12">
          <FileCode className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500">No scripts available</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {scripts.map((script) => (
            <div key={script.id} className="card hover:shadow-lg transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900">{script.displayName}</h3>
                  {script.category && (
                    <span className="text-xs text-gray-500">{script.category}</span>
                  )}
                </div>
                {script.isGlobal && (
                  <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                    Global
                  </span>
                )}
              </div>

              {script.description && (
                <p className="text-sm text-gray-600 mb-4">{script.description}</p>
              )}

              {script.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-4">
                  {script.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded"
                    >
                      <Tag className="w-3 h-3" />
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              <button
                onClick={() => openExecutionModal(script)}
                disabled={!selectedTenant}
                className="btn btn-primary w-full flex items-center justify-center gap-2"
              >
                <Play className="w-4 h-4" />
                Execute
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Execution Modal */}
      {executionModal.script && selectedTenant && (
        <ExecutionModal
          isOpen={executionModal.isOpen}
          onClose={closeExecutionModal}
          scriptId={executionModal.script.id}
          scriptName={executionModal.script.displayName}
          tenantId={selectedTenant.id}
          requiresAuth={executionModal.script.requiresAuth}
          authType={executionModal.script.authType}
          parameters={{}}
        />
      )}
    </div>
  );
}
