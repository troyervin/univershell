import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Save, X, Plus, Trash2, AlertCircle } from 'lucide-react';
import api from '../lib/api';
import { useTenantStore } from '../stores/tenantStore';

interface ScriptFormData {
  name: string;
  displayName: string;
  description: string;
  code: string;
  category: string;
  tags: string[];
  isGlobal: boolean;
  requiresAuth: boolean;
  credentialType: string;
  authType: string;
  parameters: Array<{ name: string; type: string; required: boolean; description: string }>;
  outputs: Array<{ name: string; type: string; description: string }>;
  tenantIds: string[];
}

export default function ScriptEditorPage() {
  const navigate = useNavigate();
  const { scriptId } = useParams<{ scriptId?: string }>();
  const { tenants } = useTenantStore();
  const [loading, setLoading] = useState(false);
  const [tagInput, setTagInput] = useState('');

  const [formData, setFormData] = useState<ScriptFormData>({
    name: '',
    displayName: '',
    description: '',
    code: '# PowerShell script\n# Available variables when using authentication:\n# $AccessToken - The access token for API calls\n\n',
    category: '',
    tags: [],
    isGlobal: false,
    requiresAuth: false,
    credentialType: 'MICROSOFT_GRAPH',
    authType: 'APPLICATION',
    parameters: [],
    outputs: [],
    tenantIds: [],
  });

  useEffect(() => {
    if (scriptId) {
      fetchScript();
    }
  }, [scriptId]);

  const fetchScript = async () => {
    try {
      const response = await api.get(`/scripts/${scriptId}`);
      const script = response.data;
      setFormData({
        name: script.name,
        displayName: script.displayName,
        description: script.description || '',
        code: script.code,
        category: script.category || '',
        tags: script.tags || [],
        isGlobal: script.isGlobal,
        requiresAuth: script.requiresAuth || false,
        credentialType: script.credentialType || 'MICROSOFT_GRAPH',
        authType: script.authType || 'APPLICATION',
        parameters: script.parameters || [],
        outputs: script.outputs || [],
        tenantIds: script.tenantAssignments?.map((ta: any) => ta.tenantId) || [],
      });
    } catch (error) {
      console.error('Failed to fetch script:', error);
      alert('Failed to load script');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const payload = {
        ...formData,
        requiresAuth: formData.requiresAuth,
        credentialType: formData.requiresAuth ? formData.credentialType : null,
        authType: formData.requiresAuth ? formData.authType : null,
      };

      if (scriptId) {
        await api.patch(`/scripts/${scriptId}`, payload);
      } else {
        await api.post('/scripts', payload);
      }

      navigate('/scripts');
    } catch (error) {
      console.error('Failed to save script:', error);
      alert('Failed to save script. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const addParameter = () => {
    setFormData({
      ...formData,
      parameters: [
        ...formData.parameters,
        { name: '', type: 'string', required: false, description: '' },
      ],
    });
  };

  const removeParameter = (index: number) => {
    setFormData({
      ...formData,
      parameters: formData.parameters.filter((_, i) => i !== index),
    });
  };

  const updateParameter = (index: number, field: string, value: any) => {
    const newParams = [...formData.parameters];
    newParams[index] = { ...newParams[index], [field]: value };
    setFormData({ ...formData, parameters: newParams });
  };

  const addOutput = () => {
    setFormData({
      ...formData,
      outputs: [...formData.outputs, { name: '', type: 'string', description: '' }],
    });
  };

  const removeOutput = (index: number) => {
    setFormData({
      ...formData,
      outputs: formData.outputs.filter((_, i) => i !== index),
    });
  };

  const updateOutput = (index: number, field: string, value: any) => {
    const newOutputs = [...formData.outputs];
    newOutputs[index] = { ...newOutputs[index], [field]: value };
    setFormData({ ...formData, outputs: newOutputs });
  };

  const addTag = () => {
    if (tagInput.trim() && !formData.tags.includes(tagInput.trim())) {
      setFormData({ ...formData, tags: [...formData.tags, tagInput.trim()] });
      setTagInput('');
    }
  };

  const removeTag = (tag: string) => {
    setFormData({ ...formData, tags: formData.tags.filter(t => t !== tag) });
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">
          {scriptId ? 'Edit Script' : 'Create Script'}
        </h1>
        <button
          onClick={() => navigate('/scripts')}
          className="btn btn-secondary flex items-center gap-2"
        >
          <X className="w-4 h-4" />
          Cancel
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Information */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Basic Information</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Script Name (Internal) *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="input"
                placeholder="get-user-mailbox"
                required
              />
              <p className="text-xs text-gray-500 mt-1">Lowercase, no spaces (use hyphens)</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Display Name *
              </label>
              <input
                type="text"
                value={formData.displayName}
                onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                className="input"
                placeholder="Get User Mailbox"
                required
              />
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="input"
                rows={3}
                placeholder="Retrieves mailbox information for a user..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Category
              </label>
              <input
                type="text"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="input"
                placeholder="User Management, Email, etc."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tags
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                  className="input"
                  placeholder="Add tag..."
                />
                <button
                  type="button"
                  onClick={addTag}
                  className="btn btn-secondary px-3"
                >
                  Add
                </button>
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {formData.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-md flex items-center gap-1"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="hover:text-blue-900"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Authentication Settings */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Authentication</h2>

          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="requiresAuth"
                checked={formData.requiresAuth}
                onChange={(e) => setFormData({ ...formData, requiresAuth: e.target.checked })}
                className="w-4 h-4"
              />
              <label htmlFor="requiresAuth" className="text-sm font-medium text-gray-700">
                This script requires authentication to Microsoft 365/Azure services
              </label>
            </div>

            {formData.requiresAuth && (
              <>
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-blue-800">
                      <p className="font-medium mb-1">Authentication will be handled automatically</p>
                      <p>The <code className="bg-blue-100 px-1 rounded">$AccessToken</code> variable will be available in your script.</p>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Service / Credential Type *
                  </label>
                  <select
                    value={formData.credentialType}
                    onChange={(e) => setFormData({ ...formData, credentialType: e.target.value })}
                    className="input"
                    required
                  >
                    <option value="MICROSOFT_GRAPH">Microsoft Graph</option>
                    <option value="EXCHANGE_ONLINE">Exchange Online</option>
                    <option value="SHAREPOINT_ONLINE">SharePoint Online</option>
                    <option value="AZURE_AD">Azure AD</option>
                    <option value="ACTIVE_DIRECTORY">Active Directory</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Authentication Type *
                  </label>
                  <div className="space-y-2">
                    <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                      <input
                        type="radio"
                        name="authType"
                        value="APPLICATION"
                        checked={formData.authType === 'APPLICATION'}
                        onChange={(e) => setFormData({ ...formData, authType: e.target.value })}
                        className="mt-1"
                      />
                      <div>
                        <div className="font-medium text-gray-900">Application (App-Only)</div>
                        <div className="text-sm text-gray-600">
                          Uses tenant credentials. Best for automated tasks, bulk operations.
                          No user interaction required.
                        </div>
                      </div>
                    </label>

                    <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                      <input
                        type="radio"
                        name="authType"
                        value="DELEGATED"
                        checked={formData.authType === 'DELEGATED'}
                        onChange={(e) => setFormData({ ...formData, authType: e.target.value })}
                        className="mt-1"
                      />
                      <div>
                        <div className="font-medium text-gray-900">Delegated (User Context)</div>
                        <div className="text-sm text-gray-600">
                          User authenticates each time. Required for some Exchange/SharePoint modules.
                          User will see device code prompt when running.
                        </div>
                      </div>
                    </label>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* PowerShell Code */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">PowerShell Code *</h2>
          <textarea
            value={formData.code}
            onChange={(e) => setFormData({ ...formData, code: e.target.value })}
            className="input font-mono text-sm"
            rows={20}
            placeholder="# Your PowerShell script here..."
            required
          />
          <p className="text-xs text-gray-500 mt-2">
            {formData.requiresAuth && (
              <span className="text-blue-600 font-medium">
                $AccessToken will be automatically available.
              </span>
            )}
            {' '}Parameters will be passed as PowerShell variables.
          </p>
        </div>

        {/* Parameters */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Input Parameters</h2>
            <button
              type="button"
              onClick={addParameter}
              className="btn btn-secondary flex items-center gap-2 text-sm"
            >
              <Plus className="w-4 h-4" />
              Add Parameter
            </button>
          </div>

          {formData.parameters.length === 0 ? (
            <p className="text-sm text-gray-500">No parameters defined. Add parameters that users will provide when running this script.</p>
          ) : (
            <div className="space-y-3">
              {formData.parameters.map((param, index) => (
                <div key={index} className="border rounded-lg p-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Parameter Name
                      </label>
                      <input
                        type="text"
                        value={param.name}
                        onChange={(e) => updateParameter(index, 'name', e.target.value)}
                        className="input text-sm"
                        placeholder="UserEmail"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Type
                      </label>
                      <select
                        value={param.type}
                        onChange={(e) => updateParameter(index, 'type', e.target.value)}
                        className="input text-sm"
                      >
                        <option value="string">String</option>
                        <option value="number">Number</option>
                        <option value="boolean">Boolean</option>
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Description
                      </label>
                      <input
                        type="text"
                        value={param.description}
                        onChange={(e) => updateParameter(index, 'description', e.target.value)}
                        className="input text-sm"
                        placeholder="The user's email address"
                      />
                    </div>
                    <div className="col-span-2 flex items-center justify-between">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={param.required}
                          onChange={(e) => updateParameter(index, 'required', e.target.checked)}
                          className="w-4 h-4"
                        />
                        <span className="text-sm text-gray-700">Required</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => removeParameter(index)}
                        className="text-red-600 hover:text-red-700 text-sm flex items-center gap-1"
                      >
                        <Trash2 className="w-4 h-4" />
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Outputs */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Output Variables</h2>
            <button
              type="button"
              onClick={addOutput}
              className="btn btn-secondary flex items-center gap-2 text-sm"
            >
              <Plus className="w-4 h-4" />
              Add Output
            </button>
          </div>

          <p className="text-sm text-gray-600 mb-3">
            Define variables this script outputs (for use in workflows). Return data as JSON.
          </p>

          {formData.outputs.length === 0 ? (
            <p className="text-sm text-gray-500">No outputs defined.</p>
          ) : (
            <div className="space-y-3">
              {formData.outputs.map((output, index) => (
                <div key={index} className="border rounded-lg p-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Variable Name
                      </label>
                      <input
                        type="text"
                        value={output.name}
                        onChange={(e) => updateOutput(index, 'name', e.target.value)}
                        className="input text-sm"
                        placeholder="UserId"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Type
                      </label>
                      <select
                        value={output.type}
                        onChange={(e) => updateOutput(index, 'type', e.target.value)}
                        className="input text-sm"
                      >
                        <option value="string">String</option>
                        <option value="number">Number</option>
                        <option value="boolean">Boolean</option>
                        <option value="object">Object</option>
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Description
                      </label>
                      <input
                        type="text"
                        value={output.description}
                        onChange={(e) => updateOutput(index, 'description', e.target.value)}
                        className="input text-sm"
                        placeholder="The created user's ID"
                      />
                    </div>
                    <div className="col-span-2 flex justify-end">
                      <button
                        type="button"
                        onClick={() => removeOutput(index)}
                        className="text-red-600 hover:text-red-700 text-sm flex items-center gap-1"
                      >
                        <Trash2 className="w-4 h-4" />
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tenant Assignment */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Availability</h2>

          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="isGlobal"
                checked={formData.isGlobal}
                onChange={(e) => setFormData({ ...formData, isGlobal: e.target.checked, tenantIds: [] })}
                className="w-4 h-4"
              />
              <label htmlFor="isGlobal" className="text-sm font-medium text-gray-700">
                Global script (available to all tenants)
              </label>
            </div>

            {!formData.isGlobal && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Assign to Tenants *
                </label>
                <div className="space-y-2">
                  {tenants.map((tenant) => (
                    <label key={tenant.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={formData.tenantIds.includes(tenant.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFormData({ ...formData, tenantIds: [...formData.tenantIds, tenant.id] });
                          } else {
                            setFormData({ ...formData, tenantIds: formData.tenantIds.filter(id => id !== tenant.id) });
                          }
                        }}
                        className="w-4 h-4"
                      />
                      <span className="text-sm text-gray-700">{tenant.displayName}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Submit */}
        <div className="flex items-center gap-3 pt-4 border-t">
          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            {loading ? 'Saving...' : scriptId ? 'Update Script' : 'Create Script'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/scripts')}
            className="btn btn-secondary"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
