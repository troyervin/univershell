import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuthStore } from './stores/authStore';
import { useTenantStore } from './stores/tenantStore';

// Pages
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ScriptsPage from './pages/ScriptsPage';
import WorkflowsPage from './pages/WorkflowsPage';
import TenantsPage from './pages/TenantsPage';
import TenantAdminPage from './pages/TenantAdminPage';
import ExecutionsPage from './pages/ExecutionsPage';
import ProfilePage from './pages/ProfilePage';
import Layout from './components/Layout';

// Protected Route
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function App() {
  const { isAuthenticated, loadUser } = useAuthStore();
  const { fetchTenants } = useTenantStore();

  useEffect(() => {
    if (isAuthenticated) {
      loadUser();
      fetchTenants();
    }
  }, [isAuthenticated]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="scripts" element={<ScriptsPage />} />
          <Route path="workflows" element={<WorkflowsPage />} />
          <Route path="tenants" element={<TenantsPage />} />
          <Route path="tenant-admin/:tenantId" element={<TenantAdminPage />} />
          <Route path="executions" element={<ExecutionsPage />} />
          <Route path="profile" element={<ProfilePage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
