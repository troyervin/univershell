import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { User, Link as LinkIcon, Unlink, CheckCircle, AlertCircle } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import api from '../lib/api';

interface MicrosoftConnection {
  id: string;
  microsoftEmail: string;
  scope: string;
  createdAt: string;
  updatedAt: string;
}

export default function ProfilePage() {
  const { user } = useAuthStore();
  const [searchParams] = useSearchParams();
  const [connection, setConnection] = useState<MicrosoftConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    fetchConnectionStatus();

    // Check for OAuth callback params
    const error = searchParams.get('error');
    const connected = searchParams.get('connected');

    if (error) {
      setAlert({
        type: 'error',
        message: `Failed to connect: ${error}`,
      });
    } else if (connected) {
      setAlert({
        type: 'success',
        message: 'Microsoft account connected successfully!',
      });
      fetchConnectionStatus();
    }
  }, [searchParams]);

  const fetchConnectionStatus = async () => {
    setLoading(true);
    try {
      const response = await api.get('/oauth/status');
      if (response.data.connected) {
        setConnection(response.data.connection);
      }
    } catch (error) {
      console.error('Failed to fetch connection status:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    setConnecting(true);
    setAlert(null);

    try {
      const response = await api.get('/oauth/connect');
      const { authUrl } = response.data;

      // Redirect to Microsoft OAuth
      window.location.href = authUrl;
    } catch (error) {
      console.error('Failed to initiate OAuth:', error);
      setAlert({
        type: 'error',
        message: 'Failed to start connection process',
      });
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect your Microsoft account? Scripts requiring delegated auth will no longer work.')) {
      return;
    }

    try {
      await api.delete('/oauth/disconnect');
      setConnection(null);
      setAlert({
        type: 'success',
        message: 'Microsoft account disconnected',
      });
    } catch (error) {
      console.error('Failed to disconnect:', error);
      setAlert({
        type: 'error',
        message: 'Failed to disconnect account',
      });
    }
  };

  if (loading) {
    return <div className="text-center py-12">Loading profile...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Profile</h1>
        <p className="text-gray-600 mt-1">Manage your account settings and connections</p>
      </div>

      {/* Alert */}
      {alert && (
        <div
          className={`p-4 rounded-lg flex items-start gap-3 ${
            alert.type === 'success'
              ? 'bg-green-50 border border-green-200'
              : 'bg-red-50 border border-red-200'
          }`}
        >
          {alert.type === 'success' ? (
            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          )}
          <div>
            <p
              className={`text-sm font-medium ${
                alert.type === 'success' ? 'text-green-800' : 'text-red-800'
              }`}
            >
              {alert.message}
            </p>
          </div>
        </div>
      )}

      {/* User Info */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <User className="w-5 h-5" />
          Account Information
        </h2>
        <div className="space-y-3">
          <div>
            <span className="text-sm text-gray-500">Username</span>
            <p className="text-gray-900 font-medium">{user?.username}</p>
          </div>
          <div>
            <span className="text-sm text-gray-500">Email</span>
            <p className="text-gray-900 font-medium">{user?.email}</p>
          </div>
          {user?.firstName && (
            <div>
              <span className="text-sm text-gray-500">Name</span>
              <p className="text-gray-900 font-medium">
                {user.firstName} {user.lastName}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Microsoft Account Connection */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <LinkIcon className="w-5 h-5" />
          Microsoft Account Connection
        </h2>

        {connection ? (
          <>
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg mb-4">
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-green-800 mb-1">
                    Microsoft account connected
                  </p>
                  <p className="text-sm text-green-700">
                    Connected as: <span className="font-medium">{connection.microsoftEmail}</span>
                  </p>
                  <p className="text-xs text-green-600 mt-1">
                    Scripts requiring delegated authentication will run automatically using your Microsoft account.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-3 mb-4">
              <div>
                <span className="text-sm text-gray-500">Connected Account</span>
                <p className="text-gray-900 font-medium">{connection.microsoftEmail}</p>
              </div>
              <div>
                <span className="text-sm text-gray-500">Permissions</span>
                <div className="flex flex-wrap gap-2 mt-1">
                  {connection.scope?.split(' ').map((scope) => (
                    <span
                      key={scope}
                      className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-md"
                    >
                      {scope}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <span className="text-sm text-gray-500">Connected Since</span>
                <p className="text-gray-900">{new Date(connection.createdAt).toLocaleString()}</p>
              </div>
            </div>

            <button
              onClick={handleDisconnect}
              className="btn btn-danger flex items-center gap-2"
            >
              <Unlink className="w-4 h-4" />
              Disconnect Microsoft Account
            </button>
          </>
        ) : (
          <>
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg mb-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-blue-800 mb-1">
                    No Microsoft account connected
                  </p>
                  <p className="text-sm text-blue-700">
                    Connect your Microsoft account to run scripts that require delegated authentication.
                    Some Microsoft 365 PowerShell modules require delegated auth and won't work with
                    application-only authentication.
                  </p>
                </div>
              </div>
            </div>

            <div className="mb-4">
              <p className="text-sm font-medium text-gray-700 mb-2">What you'll be able to do:</p>
              <ul className="list-disc list-inside space-y-1 text-sm text-gray-600">
                <li>Run scripts that access your mailbox</li>
                <li>Execute commands that require user-specific permissions</li>
                <li>Use PowerShell modules that don't support app-only auth</li>
                <li>Automate tasks on your behalf without manual sign-in each time</li>
              </ul>
            </div>

            <div className="mb-4">
              <p className="text-sm font-medium text-gray-700 mb-2">
                Required permissions (one-time consent):
              </p>
              <div className="flex flex-wrap gap-2">
                {[
                  'User.Read',
                  'User.ReadWrite.All',
                  'Group.ReadWrite.All',
                  'Mail.ReadWrite',
                  'Mail.Send',
                  'Calendars.ReadWrite',
                ].map((scope) => (
                  <span
                    key={scope}
                    className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-md"
                  >
                    {scope}
                  </span>
                ))}
              </div>
            </div>

            <button
              onClick={handleConnect}
              disabled={connecting}
              className="btn btn-primary flex items-center gap-2"
            >
              <LinkIcon className="w-4 h-4" />
              {connecting ? 'Connecting...' : 'Connect Microsoft Account'}
            </button>

            <p className="text-xs text-gray-500 mt-3">
              You'll be redirected to Microsoft to sign in and grant permissions. Your refresh token will be
              securely encrypted and stored to enable automatic script execution.
            </p>
          </>
        )}
      </div>

      {/* Security Note */}
      <div className="card bg-gray-50">
        <h3 className="text-sm font-medium text-gray-900 mb-2">Security & Privacy</h3>
        <ul className="space-y-2 text-xs text-gray-600">
          <li className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
            <span>Your refresh token is encrypted using AES-256-GCM encryption</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
            <span>Tokens are only used to execute scripts you authorize</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
            <span>You can disconnect your account at any time</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
            <span>Refresh tokens are automatically refreshed and expire after 90 days of inactivity</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
