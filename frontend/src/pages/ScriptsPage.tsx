import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileCode, Play, Tag, Plus, Edit, Download, Upload, Trash2 } from 'lucide-react';
import api from '../lib/api';
import { useTenantStore } from '../stores/tenantStore';
import { useAuthStore } from '../stores/authStore';
import ExecutionModal from '../components/ExecutionModal';
import ImportScriptModal from '../components/ImportScriptModal';

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
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'execute' | 'manage'>('execute');

  const isGlobalAdmin = user?.roles?.includes('admin');
  const isScriptManager = user?.roles?.includes('script_manager');
  const canManageScripts = isGlobalAdmin || isScriptManager;

  // Check if user is admin of any tenant
  const adminTenantIds = Object.entries(user?.tenantRoles || {})
    .filter(([_, role]) => role === 'ADMIN')
    .map(([tenantId, _]) => tenantId);
  const isTenantAdmin = adminTenantIds.length > 0;

  const canManageAnyScripts = canManageScripts || isTenantAdmin;

  useEffect(() => {
    fetchScripts();
  }, [selectedTenant, viewMode]);

  const fetchScripts = async () => {
    setLoading(true);
    try {
      const response = await api.get('/scripts', {
        params: {
          ...(selectedTenant && { tenantId: selectedTenant.id }),
          ...(viewMode === 'manage' && { manageable: 'true' }),
        },
      });
      setScripts(response.data);
    } catch (error) {
      console.error('Failed to fetch scripts:', error);
    } finally {
      setLoading(false);
    }
  };

  const canManageThisScript = (script: Script): boolean => {
    // Global admins and script managers can manage all scripts
    if (isGlobalAdmin || isScriptManager) {
      return true;
    }

    // Tenant admins cannot manage global scripts
    if (script.isGlobal) {
      return false;
    }

    // Check if user is admin of any tenant this script is assigned to
    // (This would require script.tenantAssignments to be included, but for now we'll check the basic permission)
    return isTenantAdmin;
  };

  const handleExportScript = async (scriptId: string, scriptName: string) => {
    try {
      const response = await api.get(`/scripts/export/${scriptId}`, {
        responseType: 'blob',
      });

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${scriptName}.json`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      alert(`Failed to export script: ${error.response?.data?.error || error.message}`);
    }
  };

  const handleDeleteScript = async (scriptId: string, scriptName: string) => {
    if (!confirm(`Are you sure you want to delete "${scriptName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      await api.delete(`/scripts/${scriptId}`);
      alert('Script deleted successfully');
      fetchScripts();
    } catch (error: any) {
      alert(`Failed to delete script: ${error.response?.data?.error || error.message}`);
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
        <div className="flex items-center gap-3">
          {canManageAnyScripts && (
            <>
              {/* View Mode Toggle */}
              <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setViewMode('execute')}
                  className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
                    viewMode === 'execute'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Execute
                </button>
                <button
                  onClick={() => setViewMode('manage')}
                  className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
                    viewMode === 'manage'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Manage
                </button>
              </div>

              {/* Import Script Button */}
              <button
                onClick={() => setImportModalOpen(true)}
                className="btn btn-secondary flex items-center gap-2"
              >
                <Upload className="w-4 h-4" />
                Import
              </button>

              {/* Create Script Button */}
              {canManageScripts && (
                <button
                  onClick={() => navigate('/scripts/new')}
                  className="btn btn-primary flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Create
                </button>
              )}
            </>
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

              {viewMode === 'execute' ? (
                <button
                  onClick={() => openExecutionModal(script)}
                  disabled={!selectedTenant}
                  className="btn btn-primary w-full flex items-center justify-center gap-2"
                >
                  <Play className="w-4 h-4" />
                  Execute
                </button>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => navigate(`/scripts/${script.id}/edit`)}
                      className="btn btn-secondary flex items-center justify-center gap-2"
                    >
                      <Edit className="w-4 h-4" />
                      Edit
                    </button>
                    <button
                      onClick={() => handleExportScript(script.id, script.name)}
                      className="btn btn-secondary flex items-center justify-center gap-2"
                    >
                      <Download className="w-4 h-4" />
                      Export
                    </button>
                  </div>
                  <button
                    onClick={() => handleDeleteScript(script.id, script.displayName)}
                    className="btn w-full flex items-center justify-center gap-2 bg-red-50 text-red-700 hover:bg-red-100 border border-red-200"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Import Modal */}
      <ImportScriptModal
        isOpen={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onImportSuccess={() => {
          fetchScripts();
          alert('Script imported successfully');
        }}
      />

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
