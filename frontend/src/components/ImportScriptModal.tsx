import { useState, useRef } from 'react';
import { X, Upload, FileCode, AlertCircle } from 'lucide-react';
import api from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import { useTenantStore } from '../stores/tenantStore';

interface ImportScriptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportSuccess: () => void;
}

interface ScriptData {
  name: string;
  displayName: string;
  description?: string;
  code: string;
  parameters?: any[];
  outputs?: any[];
  category?: string;
  tags?: string[];
  requiresAuth?: boolean;
  authType?: 'APPLICATION' | 'DELEGATED' | null;
  credentialType?: string;
}

export default function ImportScriptModal({
  isOpen,
  onClose,
  onImportSuccess,
}: ImportScriptModalProps) {
  const { user } = useAuthStore();
  const { tenants } = useTenantStore();
  const [scriptData, setScriptData] = useState<ScriptData | null>(null);
  const [importType, setImportType] = useState<'global' | 'tenant'>('tenant');
  const [selectedTenants, setSelectedTenants] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isGlobalAdmin = user?.roles?.includes('admin');
  const adminTenantIds = Object.entries(user?.tenantRoles || {})
    .filter(([_, role]) => role === 'ADMIN')
    .map(([tenantId, _]) => tenantId);

  const availableTenants = tenants.filter(t =>
    isGlobalAdmin || adminTenantIds.includes(t.id)
  );

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      // Validate required fields
      if (!data.name || !data.displayName || !data.code) {
        setError('Invalid script file: missing required fields (name, displayName, code)');
        setScriptData(null);
        return;
      }

      setScriptData(data);
      setError(null);
    } catch (err) {
      setError('Failed to parse script file. Please ensure it is a valid JSON file.');
      setScriptData(null);
    }
  };

  const handleImport = async () => {
    if (!scriptData) return;

    if (importType === 'tenant' && selectedTenants.length === 0) {
      setError('Please select at least one tenant');
      return;
    }

    setImporting(true);
    setError(null);

    try {
      await api.post('/scripts/import', {
        script: scriptData,
        isGlobal: importType === 'global',
        tenantIds: importType === 'tenant' ? selectedTenants : [],
      });

      onImportSuccess();
      handleClose();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to import script');
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => {
    setScriptData(null);
    setImportType('tenant');
    setSelectedTenants([]);
    setError(null);
    setImporting(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onClose();
  };

  const toggleTenant = (tenantId: string) => {
    setSelectedTenants(prev =>
      prev.includes(tenantId)
        ? prev.filter(id => id !== tenantId)
        : [...prev, tenantId]
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900">Import Script</h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* File Upload */}
          {!scriptData && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Script File
              </label>
              <div className="flex items-center justify-center w-full">
                <label className="flex flex-col items-center justify-center w-full h-64 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <Upload className="w-12 h-12 text-gray-400 mb-3" />
                    <p className="mb-2 text-sm text-gray-500">
                      <span className="font-semibold">Click to upload</span> or drag and drop
                    </p>
                    <p className="text-xs text-gray-500">JSON script export file</p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          )}

          {/* Script Preview */}
          {scriptData && (
            <>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <FileCode className="w-5 h-5 text-blue-600 mt-0.5" />
                  <div className="flex-1">
                    <h3 className="font-medium text-blue-900">{scriptData.displayName}</h3>
                    <p className="text-sm text-blue-700 mt-1">{scriptData.name}</p>
                    {scriptData.description && (
                      <p className="text-sm text-blue-600 mt-2">{scriptData.description}</p>
                    )}
                    {scriptData.category && (
                      <p className="text-xs text-blue-600 mt-2">Category: {scriptData.category}</p>
                    )}
                    {scriptData.requiresAuth && (
                      <p className="text-xs text-blue-600 mt-1">
                        Requires Authentication: {scriptData.authType || 'Yes'}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Import Type Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Import As
                </label>
                <div className="space-y-3">
                  {isGlobalAdmin && (
                    <label className="flex items-start p-4 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                      <input
                        type="radio"
                        name="importType"
                        value="global"
                        checked={importType === 'global'}
                        onChange={() => {
                          setImportType('global');
                          setSelectedTenants([]);
                        }}
                        className="mt-1 mr-3"
                      />
                      <div>
                        <div className="font-medium text-gray-900">Global Script</div>
                        <div className="text-sm text-gray-500 mt-1">
                          Available to all tenants. Only global admins can create global scripts.
                        </div>
                      </div>
                    </label>
                  )}

                  <label className="flex items-start p-4 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                    <input
                      type="radio"
                      name="importType"
                      value="tenant"
                      checked={importType === 'tenant'}
                      onChange={() => setImportType('tenant')}
                      className="mt-1 mr-3"
                    />
                    <div>
                      <div className="font-medium text-gray-900">Tenant-Specific Script</div>
                      <div className="text-sm text-gray-500 mt-1">
                        Only available to selected tenants. For example, user onboarding locked to Onni.
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Tenant Selection */}
              {importType === 'tenant' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Assign to Tenants
                  </label>
                  <div className="border border-gray-200 rounded-lg divide-y max-h-64 overflow-y-auto">
                    {availableTenants.length === 0 ? (
                      <div className="p-4 text-sm text-gray-500 text-center">
                        No tenants available
                      </div>
                    ) : (
                      availableTenants.map(tenant => (
                        <label
                          key={tenant.id}
                          className="flex items-center p-3 hover:bg-gray-50 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selectedTenants.includes(tenant.id)}
                            onChange={() => toggleTenant(tenant.id)}
                            className="mr-3"
                          />
                          <div>
                            <div className="font-medium text-gray-900">{tenant.displayName}</div>
                            <div className="text-sm text-gray-500">{tenant.name}</div>
                          </div>
                        </label>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* Change File */}
              <button
                onClick={() => {
                  setScriptData(null);
                  setError(null);
                  if (fileInputRef.current) {
                    fileInputRef.current.value = '';
                  }
                }}
                className="text-sm text-blue-600 hover:text-blue-700"
              >
                Choose a different file
              </button>
            </>
          )}

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center gap-2 text-red-700">
                <AlertCircle className="w-5 h-5" />
                <span className="text-sm">{error}</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t bg-gray-50">
          <button onClick={handleClose} className="btn btn-secondary">
            Cancel
          </button>
          {scriptData && (
            <button
              onClick={handleImport}
              disabled={importing || (importType === 'tenant' && selectedTenants.length === 0)}
              className="btn btn-primary"
            >
              {importing ? 'Importing...' : 'Import Script'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
