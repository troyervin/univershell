import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, ExternalLink, Loader, CheckCircle, XCircle, FileText } from 'lucide-react';
import api from '../lib/api';

interface ExecutionModalProps {
  isOpen: boolean;
  onClose: () => void;
  scriptId: string;
  scriptName: string;
  tenantId: string;
  requiresAuth: boolean;
  authType: 'APPLICATION' | 'DELEGATED' | null;
  parameters?: Record<string, any>;
}

type AuthStatus = 'idle' | 'initiating' | 'waiting' | 'polling' | 'authenticated' | 'error';
type ExecutionStatus = 'idle' | 'running' | 'success' | 'error';

export default function ExecutionModal({
  isOpen,
  onClose,
  scriptId,
  scriptName,
  tenantId,
  requiresAuth,
  authType,
  parameters = {},
}: ExecutionModalProps) {
  const navigate = useNavigate();
  const [authStatus, setAuthStatus] = useState<AuthStatus>('idle');
  const [executionStatus, setExecutionStatus] = useState<ExecutionStatus>('idle');
  const [deviceCode, setDeviceCode] = useState<{
    requestId: string;
    userCode: string;
    verificationUri: string;
    message: string;
  } | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [executionResult, setExecutionResult] = useState<{
    success: boolean;
    output: any;
    error?: string;
    duration: number;
  } | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setAuthStatus('idle');
      setExecutionStatus('idle');
      setDeviceCode(null);
      setAccessToken(null);
      setError(null);
      setExecutionId(null);
      setExecutionResult(null);

      // If script requires delegated auth, initiate device code flow immediately
      if (requiresAuth && authType === 'DELEGATED') {
        initiateDeviceCodeFlow();
      }
    }
  }, [isOpen, scriptId]);

  const initiateDeviceCodeFlow = async () => {
    setAuthStatus('initiating');
    setError(null);

    try {
      const response = await api.post('/executions/auth/device-code/initiate', {
        scriptId,
        tenantId,
      });

      setDeviceCode({
        requestId: response.data.requestId,
        userCode: response.data.userCode,
        verificationUri: response.data.verificationUri,
        message: response.data.message,
      });

      setAuthStatus('waiting');

      // Start polling for authentication
      pollForAuthentication(response.data.requestId);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to initiate device code flow');
      setAuthStatus('error');
    }
  };

  const pollForAuthentication = async (requestId: string) => {
    setAuthStatus('polling');

    const pollInterval = setInterval(async () => {
      try {
        const response = await api.get(`/executions/auth/device-code/poll/${requestId}`);
        const { status, accessToken: token, error: pollError } = response.data;

        if (status === 'completed' && token) {
          clearInterval(pollInterval);
          setAccessToken(token);
          setAuthStatus('authenticated');
          // Auto-execute the script after authentication
          executeScript(token);
        } else if (status === 'error' || status === 'expired') {
          clearInterval(pollInterval);
          setError(pollError || 'Authentication failed or expired');
          setAuthStatus('error');
        }
        // Continue polling if status is 'pending'
      } catch (err: any) {
        clearInterval(pollInterval);
        setError(err.response?.data?.error || 'Authentication polling failed');
        setAuthStatus('error');
      }
    }, 5000); // Poll every 5 seconds

    // Cleanup interval on unmount
    return () => clearInterval(pollInterval);
  };

  const executeScript = async (token?: string) => {
    setExecutionStatus('running');
    setError(null);

    try {
      const response = await api.post('/executions/script', {
        scriptId,
        tenantId,
        parameters,
        ...(token && { accessToken: token }),
      });

      setExecutionId(response.data.executionId);
      setExecutionResult(response.data);
      setExecutionStatus(response.data.success ? 'success' : 'error');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Script execution failed');
      setExecutionStatus('error');
    }
  };

  const handleExecute = () => {
    if (!requiresAuth || authType === 'APPLICATION') {
      // No delegated auth needed, execute directly
      executeScript();
    } else {
      // Delegated auth already initiated
      // Just wait for user to authenticate
    }
  };

  const handleClose = () => {
    setAuthStatus('idle');
    setExecutionStatus('idle');
    setDeviceCode(null);
    setAccessToken(null);
    setError(null);
    setExecutionId(null);
    setExecutionResult(null);
    onClose();
  };

  const handleViewFullLog = () => {
    if (executionId) {
      navigate(`/executions/${executionId}`);
      handleClose();
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900">Execute Script</h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Script Info */}
          <div>
            <h3 className="font-medium text-gray-900">{scriptName}</h3>
            {requiresAuth && authType && (
              <p className="text-sm text-gray-500 mt-1">
                Authentication Type: <span className="font-medium">{authType}</span>
              </p>
            )}
          </div>

          {/* Device Code Auth UI */}
          {requiresAuth && authType === 'DELEGATED' && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-medium text-blue-900 mb-3">Microsoft Account Authentication Required</h4>

              {authStatus === 'initiating' && (
                <div className="flex items-center gap-2 text-blue-700">
                  <Loader className="w-4 h-4 animate-spin" />
                  <span>Initiating authentication...</span>
                </div>
              )}

              {(authStatus === 'waiting' || authStatus === 'polling') && deviceCode && (
                <div className="space-y-4">
                  <p className="text-sm text-blue-800">
                    To authenticate, please complete the following steps:
                  </p>

                  <ol className="list-decimal list-inside space-y-2 text-sm text-blue-800">
                    <li>
                      Visit:{' '}
                      <a
                        href={deviceCode.verificationUri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-blue-600 hover:underline font-medium"
                      >
                        {deviceCode.verificationUri}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </li>
                    <li>
                      Enter this code:
                      <div className="mt-2 flex items-center gap-2">
                        <code className="bg-white px-4 py-2 rounded border border-blue-300 text-lg font-mono font-bold text-blue-900">
                          {deviceCode.userCode}
                        </code>
                        <button
                          onClick={() => copyToClipboard(deviceCode.userCode)}
                          className="btn btn-secondary text-sm"
                        >
                          Copy
                        </button>
                      </div>
                    </li>
                  </ol>

                  {authStatus === 'polling' && (
                    <div className="flex items-center gap-2 text-blue-700 mt-4">
                      <Loader className="w-4 h-4 animate-spin" />
                      <span>Waiting for you to authenticate...</span>
                    </div>
                  )}
                </div>
              )}

              {authStatus === 'authenticated' && (
                <div className="flex items-center gap-2 text-green-700">
                  <CheckCircle className="w-5 h-5" />
                  <span>Authentication successful! Executing script...</span>
                </div>
              )}

              {authStatus === 'error' && (
                <div className="flex items-center gap-2 text-red-700">
                  <XCircle className="w-5 h-5" />
                  <span>Authentication failed. Please try again.</span>
                </div>
              )}
            </div>
          )}

          {/* Execution Status */}
          {executionStatus !== 'idle' && (
            <div>
              {executionStatus === 'running' && (
                <div className="flex items-center gap-2 text-blue-700">
                  <Loader className="w-4 h-4 animate-spin" />
                  <span>Executing script...</span>
                </div>
              )}

              {executionStatus === 'success' && executionResult && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-green-700 mb-2">
                    <CheckCircle className="w-5 h-5" />
                    <span className="font-medium">Script executed successfully</span>
                  </div>
                  <div className="text-sm text-gray-600">
                    Duration: {executionResult.duration}ms
                  </div>
                  {executionResult.output && (
                    <div className="mt-3">
                      <h5 className="text-sm font-medium text-gray-700 mb-2">Output:</h5>
                      <pre className="bg-white p-3 rounded border border-gray-200 text-xs overflow-x-auto max-h-64">
                        {typeof executionResult.output === 'string'
                          ? executionResult.output
                          : JSON.stringify(executionResult.output, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              {executionStatus === 'error' && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-red-700 mb-2">
                    <XCircle className="w-5 h-5" />
                    <span className="font-medium">Script execution failed</span>
                  </div>
                  {executionResult?.error && (
                    <div className="text-sm text-red-800 mt-2">
                      {executionResult.error}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center gap-2 text-red-700">
                <XCircle className="w-5 h-5" />
                <span className="text-sm">{error}</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t bg-gray-50">
          <div>
            {executionId && (executionStatus === 'success' || executionStatus === 'error') && (
              <button
                onClick={handleViewFullLog}
                className="btn btn-secondary flex items-center gap-2"
              >
                <FileText className="w-4 h-4" />
                View Full Log
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {executionStatus === 'idle' && authStatus === 'idle' && (
              <>
                <button onClick={handleClose} className="btn btn-secondary">
                  Cancel
                </button>
                {(!requiresAuth || authType === 'APPLICATION') && (
                  <button onClick={handleExecute} className="btn btn-primary">
                    Execute
                  </button>
                )}
              </>
            )}

            {(executionStatus === 'success' || executionStatus === 'error') && (
              <button onClick={handleClose} className="btn btn-primary">
                Close
              </button>
            )}

            {authStatus === 'error' && (
              <button onClick={initiateDeviceCodeFlow} className="btn btn-primary">
                Retry Authentication
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
