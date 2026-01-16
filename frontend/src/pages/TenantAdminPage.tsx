import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Users, Shield, Key, ArrowLeft } from 'lucide-react';
import { useTenantStore } from '../stores/tenantStore';
import TenantCredentialsPage from './TenantCredentialsPage';

type TabType = 'users' | 'groups' | 'credentials';

export default function TenantAdminPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const { selectedTenant, tenants } = useTenantStore();
  const [activeTab, setActiveTab] = useState<TabType>('credentials');

  const tenant = tenantId
    ? tenants.find(t => t.id === tenantId)
    : selectedTenant;

  if (!tenant) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Tenant not found</p>
        <button
          onClick={() => navigate('/tenants')}
          className="btn btn-primary mt-4"
        >
          Back to Tenants
        </button>
      </div>
    );
  }

  const tabs = [
    {
      id: 'credentials' as TabType,
      label: 'Credentials',
      icon: Key,
      description: 'Manage Microsoft 365 and AD credentials',
    },
    {
      id: 'users' as TabType,
      label: 'Users',
      icon: Users,
      description: 'Manage tenant users and permissions',
    },
    {
      id: 'groups' as TabType,
      label: 'Groups',
      icon: Shield,
      description: 'Manage tenant groups and script assignments',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/tenants')}
          className="btn btn-secondary p-2"
          title="Back to Tenants"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Tenant Administration: {tenant.displayName}
          </h1>
          <p className="text-gray-600 mt-1">
            Manage credentials, users, and groups for this tenant
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-3 py-4 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-primary-600 text-primary-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'credentials' && (
          <TenantCredentialsPage />
        )}

        {activeTab === 'users' && (
          <div className="card text-center py-12">
            <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              User Management
            </h3>
            <p className="text-gray-500 mb-4">
              User management UI coming soon. Use API endpoints for now:
            </p>
            <div className="text-left max-w-2xl mx-auto bg-gray-50 rounded-lg p-4 text-sm font-mono">
              <p className="text-gray-700 mb-2">POST /api/tenant-admin/{tenant.id}/users</p>
              <p className="text-gray-700 mb-2">GET /api/tenant-admin/{tenant.id}/users</p>
              <p className="text-gray-700">DELETE /api/tenant-admin/{tenant.id}/users/:userId</p>
            </div>
          </div>
        )}

        {activeTab === 'groups' && (
          <div className="card text-center py-12">
            <Shield className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Group Management
            </h3>
            <p className="text-gray-500 mb-4">
              Group management UI coming soon. Use API endpoints for now:
            </p>
            <div className="text-left max-w-2xl mx-auto bg-gray-50 rounded-lg p-4 text-sm font-mono">
              <p className="text-gray-700 mb-2">POST /api/tenant-admin/{tenant.id}/groups</p>
              <p className="text-gray-700 mb-2">GET /api/tenant-admin/{tenant.id}/groups</p>
              <p className="text-gray-700 mb-2">POST /api/tenant-admin/{tenant.id}/groups/:groupId/members</p>
              <p className="text-gray-700">POST /api/script-groups/assign</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
