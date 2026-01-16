import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Key,
  Plus,
  Edit,
  Trash2,
  Eye,
  EyeOff,
  CheckCircle,
  XCircle,
  AlertCircle
} from 'lucide-react';
import api from '../lib/api';
import { useTenantStore } from '../stores/tenantStore';

interface Credential {
  id: string;
  credentialType: string;
  authType: string;
  clientId: string;
  tenantIdM365: string;
  certificatePath?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function TenantCredentialsPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { selectedTenant } = useTenantStore();
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCredential, setEditingCredential] = useState<Credential | null>(null);
  const [formData, setFormData] = useState({
    credentialType: 'MICROSOFT_GRAPH',
    authType: 'APPLICATION',
    clientId: '',
    clientSecret: '',
    certificatePath: '',
    tenantIdM365: '',
  });

  const effectiveTenantId = tenantId || selectedTenant?.id;

  useEffect(() => {
    if (effectiveTenantId) {
      fetchCredentials();
    }
  }, [effectiveTenantId]);

  const fetchCredentials = async () => {
    if (!effectiveTenantId) return;

    setLoading(true);
    try {
      const response = await api.get(`/credentials/tenant/${effectiveTenantId}`);
      setCredentials(response.data);
    } catch (error) {
      console.error('Failed to fetch credentials:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingCredential(null);
    setFormData({
      credentialType: 'MICROSOFT_GRAPH',
      authType: 'APPLICATION',
      clientId: '',
      clientSecret: '',
      certificatePath: '',
      tenantIdM365: '',
    });
    setShowModal(true);
  };

  const handleEdit = (credential: Credential) => {
    setEditingCredential(credential);
    setFormData({
      credentialType: credential.credentialType,
      authType: credential.authType,
      clientId: credential.clientId,
      clientSecret: '', // Don't populate secret for security
      certificatePath: credential.certificatePath || '',
      tenantIdM365: credential.tenantIdM365,
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!effectiveTenantId) return;

    try {
      if (editingCredential) {
        // Update existing credential
        const updateData: any = {
          credentialType: formData.credentialType,
          authType: formData.authType,
          clientId: formData.clientId,
          tenantIdM365: formData.tenantIdM365,
        };

        if (formData.clientSecret) {
          updateData.clientSecret = formData.clientSecret;
        }

        if (formData.certificatePath) {
          updateData.certificatePath = formData.certificatePath;
        }

        await api.patch(`/credentials/${editingCredential.id}`, updateData);
      } else {
        // Create new credential
        await api.post('/credentials', {
          tenantId: effectiveTenantId,
          ...formData,
        });
      }

      setShowModal(false);
      fetchCredentials();
    } catch (error) {
      console.error('Failed to save credential:', error);
      alert('Failed to save credential. Please try again.');
    }
  };

  const handleDelete = async (credentialId: string) => {
    if (!confirm('Are you sure you want to delete this credential?')) {
      return;
    }

    try {
      await api.delete(`/credentials/${credentialId}`);
      fetchCredentials();
    } catch (error) {
      console.error('Failed to delete credential:', error);
      alert('Failed to delete credential. Please try again.');
    }
  };

  const handleToggleActive = async (credentialId: string) => {
    try {
      await api.post(`/credentials/${credentialId}/toggle`);
      fetchCredentials();
    } catch (error) {
      console.error('Failed to toggle credential:', error);
    }
  };

  const getCredentialTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      MICROSOFT_GRAPH: 'Microsoft Graph',
      EXCHANGE_ONLINE: 'Exchange Online',
      SHAREPOINT_ONLINE: 'SharePoint Online',
      AZURE_AD: 'Azure AD',
      ACTIVE_DIRECTORY: 'Active Directory',
    };
    return labels[type] || type;
  };

  const getAuthTypeLabel = (type: string) => {
    return type === 'APPLICATION' ? 'App-Only' : 'Delegated';
  };

  if (loading) {
    return <div className="text-center py-12">Loading credentials...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tenant Credentials</h1>
          <p className="text-gray-600 mt-1">
            Manage Microsoft 365 and Active Directory credentials for this tenant
          </p>
        </div>
        <button onClick={handleCreate} className="btn btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Add Credential
        </button>
      </div>

      {credentials.length === 0 ? (
        <div className="card text-center py-12">
          <Key className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500">No credentials configured</p>
          <button onClick={handleCreate} className="btn btn-primary mt-4">
            Add First Credential
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {credentials.map((credential) => (
            <div key={credential.id} className="card">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold text-gray-900">
                      {getCredentialTypeLabel(credential.credentialType)}
                    </h3>
                    <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {getAuthTypeLabel(credential.authType)}
                    </span>
                    {credential.isActive ? (
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" />
                        Active
                      </span>
                    ) : (
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800 flex items-center gap-1">
                        <XCircle className="w-3 h-3" />
                        Inactive
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Client ID:</span>
                      <p className="text-gray-900 font-mono text-xs mt-1">
                        {credential.clientId}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-500">M365 Tenant ID:</span>
                      <p className="text-gray-900 font-mono text-xs mt-1">
                        {credential.tenantIdM365}
                      </p>
                    </div>
                    {credential.certificatePath && (
                      <div className="col-span-2">
                        <span className="text-gray-500">Certificate Path:</span>
                        <p className="text-gray-900 font-mono text-xs mt-1">
                          {credential.certificatePath}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="text-xs text-gray-500 mt-3">
                    Created: {new Date(credential.createdAt).toLocaleString()}
                  </div>
                </div>

                <div className="flex items-center gap-2 ml-4">
                  <button
                    onClick={() => handleToggleActive(credential.id)}
                    className="btn btn-secondary p-2"
                    title={credential.isActive ? 'Deactivate' : 'Activate'}
                  >
                    {credential.isActive ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    onClick={() => handleEdit(credential)}
                    className="btn btn-secondary p-2"
                    title="Edit"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(credential.id)}
                    className="btn btn-danger p-2"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal for creating/editing credentials */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">
                {editingCredential ? 'Edit Credential' : 'Add Credential'}
              </h2>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Service Type
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Authentication Type
                  </label>
                  <select
                    value={formData.authType}
                    onChange={(e) => setFormData({ ...formData, authType: e.target.value })}
                    className="input"
                    required
                  >
                    <option value="APPLICATION">Application (App-Only)</option>
                    <option value="DELEGATED">Delegated (User)</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    {formData.authType === 'APPLICATION'
                      ? 'Use for automated scripts without user interaction'
                      : 'Use for scripts requiring user consent'}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Client ID
                  </label>
                  <input
                    type="text"
                    value={formData.clientId}
                    onChange={(e) => setFormData({ ...formData, clientId: e.target.value })}
                    className="input font-mono text-sm"
                    placeholder="00000000-0000-0000-0000-000000000000"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Client Secret {editingCredential && '(leave blank to keep existing)'}
                  </label>
                  <input
                    type="password"
                    value={formData.clientSecret}
                    onChange={(e) => setFormData({ ...formData, clientSecret: e.target.value })}
                    className="input font-mono text-sm"
                    placeholder={editingCredential ? '••••••••' : 'Enter client secret'}
                    required={!editingCredential}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Stored encrypted. Required for application authentication.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    M365 Tenant ID
                  </label>
                  <input
                    type="text"
                    value={formData.tenantIdM365}
                    onChange={(e) => setFormData({ ...formData, tenantIdM365: e.target.value })}
                    className="input font-mono text-sm"
                    placeholder="00000000-0000-0000-0000-000000000000"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Your Microsoft 365 / Azure AD tenant ID
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Certificate Path (Optional)
                  </label>
                  <input
                    type="text"
                    value={formData.certificatePath}
                    onChange={(e) => setFormData({ ...formData, certificatePath: e.target.value })}
                    className="input font-mono text-sm"
                    placeholder="/path/to/certificate.pfx"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Optional: Use certificate-based authentication instead of client secret
                  </p>
                </div>

                <div className="flex items-center gap-3 pt-4 border-t">
                  <button type="submit" className="btn btn-primary">
                    {editingCredential ? 'Update Credential' : 'Create Credential'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="btn btn-secondary"
                  >
                    Cancel
                  </button>
                </div>
              </form>

              {!editingCredential && (
                <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                  <div className="flex gap-2">
                    <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-blue-900">
                      <p className="font-medium mb-1">Azure AD App Registration Required</p>
                      <ul className="list-disc list-inside space-y-1 text-blue-800">
                        <li>Create app registration in Azure Portal</li>
                        <li>Add required API permissions</li>
                        <li>Grant admin consent</li>
                        <li>Create client secret (valid for max 24 months)</li>
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
