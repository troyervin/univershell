import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
  Home,
  FileCode,
  Workflow,
  Building2,
  Clock,
  LogOut,
  User,
  ChevronDown
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useTenantStore } from '../stores/tenantStore';

export default function Layout() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const { tenants, selectedTenant, selectTenant } = useTenantStore();

  const navItems = [
    { to: '/', label: 'Dashboard', icon: Home },
    { to: '/scripts', label: 'Scripts', icon: FileCode },
    { to: '/workflows', label: 'Workflows', icon: Workflow },
    { to: '/tenants', label: 'Tenants', icon: Building2 },
    { to: '/executions', label: 'History', icon: Clock },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-primary-600">Univershell</h1>
            </div>

            <div className="flex items-center gap-4">
              {/* Tenant Selector */}
              {tenants.length > 0 && (
                <div className="relative">
                  <select
                    value={selectedTenant?.id || ''}
                    onChange={(e) => {
                      const tenant = tenants.find(t => t.id === e.target.value);
                      if (tenant) selectTenant(tenant);
                    }}
                    className="input pr-8 appearance-none cursor-pointer"
                  >
                    {tenants.map((tenant) => (
                      <option key={tenant.id} value={tenant.id}>
                        {tenant.displayName}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none text-gray-400" />
                </div>
              )}

              {/* User Menu */}
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-900">
                    {user?.firstName || user?.username}
                  </p>
                  <p className="text-xs text-gray-500">{user?.email}</p>
                </div>
                <button
                  onClick={() => navigate('/profile')}
                  className="btn btn-secondary p-2"
                  title="Profile"
                >
                  <User className="w-5 h-5" />
                </button>
                <button
                  onClick={logout}
                  className="btn btn-secondary p-2"
                  title="Logout"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-3 py-4 text-sm font-medium border-b-2 transition-colors ${
                    isActive
                      ? 'border-primary-600 text-primary-600'
                      : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
                  }`
                }
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </NavLink>
            ))}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>
    </div>
  );
}
