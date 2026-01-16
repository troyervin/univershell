import { Building2 } from 'lucide-react';
import { useTenantStore } from '../stores/tenantStore';

export default function TenantsPage() {
  const { tenants, selectedTenant, selectTenant } = useTenantStore();

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'ACTIVE_DIRECTORY':
        return 'bg-blue-100 text-blue-800';
      case 'MICROSOFT_365':
        return 'bg-green-100 text-green-800';
      case 'HYBRID':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatType = (type: string) => {
    return type.replace(/_/g, ' ');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Tenants</h1>
        <p className="text-gray-600 mt-1">Manage your Active Directory and Microsoft 365 tenants</p>
      </div>

      {tenants.length === 0 ? (
        <div className="card text-center py-12">
          <Building2 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500">No tenants available</p>
          <p className="text-sm text-gray-400 mt-2">
            Contact your administrator to get access to tenants
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tenants.map((tenant) => (
            <div
              key={tenant.id}
              className={`card hover:shadow-lg transition-all cursor-pointer ${
                selectedTenant?.id === tenant.id
                  ? 'ring-2 ring-primary-500'
                  : ''
              }`}
              onClick={() => selectTenant(tenant)}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900 text-lg">
                    {tenant.displayName}
                  </h3>
                  <p className="text-sm text-gray-500">{tenant.name}</p>
                </div>
                <Building2 className="w-6 h-6 text-gray-400" />
              </div>

              {tenant.description && (
                <p className="text-sm text-gray-600 mb-4">{tenant.description}</p>
              )}

              <div className="flex items-center justify-between">
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${getTypeColor(tenant.type)}`}>
                  {formatType(tenant.type)}
                </span>

                {selectedTenant?.id === tenant.id && (
                  <span className="text-xs font-medium text-primary-600">
                    Currently Selected
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
