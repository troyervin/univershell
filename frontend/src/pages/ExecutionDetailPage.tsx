import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle, XCircle, Clock, AlertCircle, User, Calendar, Timer } from 'lucide-react';
import api from '../lib/api';
import { useAuthStore } from '../stores/authStore';

interface ExecutionDetail {
  id: string;
  executionType: 'SCRIPT' | 'WORKFLOW';
  status: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';
  script?: {
    id: string;
    name: string;
    displayName: string;
    description?: string;
  };
  workflow?: {
    id: string;
    name: string;
    displayName: string;
    description?: string;
  };
  tenant: {
    id: string;
    name: string;
    displayName: string;
  };
  user: {
    id: string;
    username: string;
    email: string;
  };
  startedAt: string;
  completedAt?: string;
  duration?: number;
  inputParams: Record<string, any>;
  outputData?: any;
  errorMessage?: string;
}

export default function ExecutionDetailPage() {
  const { executionId } = useParams<{ executionId: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [execution, setExecution] = useState<ExecutionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = user?.roles?.includes('admin');

  useEffect(() => {
    fetchExecution();
  }, [executionId]);

  const fetchExecution = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await api.get(`/executions/${executionId}`);
      setExecution(response.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load execution details');
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'SUCCESS':
        return <CheckCircle className="w-6 h-6 text-green-600" />;
      case 'FAILED':
        return <XCircle className="w-6 h-6 text-red-600" />;
      case 'RUNNING':
        return <AlertCircle className="w-6 h-6 text-yellow-600" />;
      default:
        return <Clock className="w-6 h-6 text-gray-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'SUCCESS':
        return 'bg-green-100 text-green-800';
      case 'FAILED':
        return 'bg-red-100 text-red-800';
      case 'RUNNING':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return '-';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
    return `${Math.floor(ms / 60000)}m ${((ms % 60000) / 1000).toFixed(0)}s`;
  };

  if (loading) {
    return <div className="text-center py-12">Loading execution details...</div>;
  }

  if (error || !execution) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => navigate('/executions')}
          className="btn btn-secondary flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Executions
        </button>
        <div className="card text-center py-12">
          <XCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <p className="text-gray-500">{error || 'Execution not found'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/executions')}
          className="btn btn-secondary flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">Execution Details</h1>
          <p className="text-gray-600 mt-1">
            {execution.script?.displayName || execution.workflow?.displayName}
          </p>
        </div>
      </div>

      {/* Status Card */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            {getStatusIcon(execution.status)}
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Execution Status</h2>
              <span className={`inline-block mt-1 px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(execution.status)}`}>
                {execution.status}
              </span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-500">Execution ID</div>
            <code className="text-xs bg-gray-100 px-2 py-1 rounded font-mono">
              {execution.id}
            </code>
          </div>
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <div className="flex items-center gap-2 text-gray-500 mb-2">
              <User className="w-4 h-4" />
              <span className="text-sm font-medium">Executed By</span>
            </div>
            <div className="text-gray-900">{execution.user.username}</div>
            <div className="text-sm text-gray-500">{execution.user.email}</div>
          </div>

          <div>
            <div className="flex items-center gap-2 text-gray-500 mb-2">
              <span className="text-sm font-medium">Tenant</span>
            </div>
            <div className="text-gray-900">{execution.tenant.displayName}</div>
            <div className="text-sm text-gray-500">{execution.tenant.name}</div>
          </div>

          <div>
            <div className="flex items-center gap-2 text-gray-500 mb-2">
              <Calendar className="w-4 h-4" />
              <span className="text-sm font-medium">Started At</span>
            </div>
            <div className="text-gray-900">
              {new Date(execution.startedAt).toLocaleString()}
            </div>
          </div>

          {execution.completedAt && (
            <div>
              <div className="flex items-center gap-2 text-gray-500 mb-2">
                <Calendar className="w-4 h-4" />
                <span className="text-sm font-medium">Completed At</span>
              </div>
              <div className="text-gray-900">
                {new Date(execution.completedAt).toLocaleString()}
              </div>
            </div>
          )}

          {execution.duration && (
            <div>
              <div className="flex items-center gap-2 text-gray-500 mb-2">
                <Timer className="w-4 h-4" />
                <span className="text-sm font-medium">Duration</span>
              </div>
              <div className="text-gray-900 font-mono">
                {formatDuration(execution.duration)}
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center gap-2 text-gray-500 mb-2">
              <span className="text-sm font-medium">Type</span>
            </div>
            <div className="text-gray-900">{execution.executionType}</div>
          </div>
        </div>
      </div>

      {/* Script/Workflow Info */}
      {(execution.script || execution.workflow) && (
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            {execution.executionType === 'SCRIPT' ? 'Script Details' : 'Workflow Details'}
          </h3>
          <div className="space-y-3">
            <div>
              <div className="text-sm text-gray-500">Display Name</div>
              <div className="text-gray-900 font-medium">
                {execution.script?.displayName || execution.workflow?.displayName}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Internal Name</div>
              <code className="text-sm bg-gray-100 px-2 py-1 rounded">
                {execution.script?.name || execution.workflow?.name}
              </code>
            </div>
            {(execution.script?.description || execution.workflow?.description) && (
              <div>
                <div className="text-sm text-gray-500">Description</div>
                <div className="text-gray-900">
                  {execution.script?.description || execution.workflow?.description}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Input Parameters */}
      {Object.keys(execution.inputParams).length > 0 && (
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Input Parameters</h3>
          <pre className="bg-gray-50 p-4 rounded-lg overflow-x-auto text-sm">
            {JSON.stringify(execution.inputParams, null, 2)}
          </pre>
        </div>
      )}

      {/* Output Data */}
      {execution.status === 'SUCCESS' && execution.outputData && (
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Output</h3>
          <pre className="bg-gray-50 p-4 rounded-lg overflow-x-auto text-sm max-h-96">
            {typeof execution.outputData === 'string'
              ? execution.outputData
              : JSON.stringify(execution.outputData, null, 2)}
          </pre>
        </div>
      )}

      {/* Error Message */}
      {execution.status === 'FAILED' && execution.errorMessage && (
        <div className="card bg-red-50 border border-red-200">
          <div className="flex items-center gap-2 text-red-700 mb-3">
            <XCircle className="w-5 h-5" />
            <h3 className="text-lg font-semibold">Error Details</h3>
          </div>
          <pre className="bg-white p-4 rounded-lg overflow-x-auto text-sm text-red-900 border border-red-200">
            {execution.errorMessage}
          </pre>
        </div>
      )}

      {/* Admin Note */}
      {!isAdmin && (
        <div className="card bg-blue-50 border border-blue-200">
          <p className="text-sm text-blue-800">
            This execution log is available for you to review. Administrators can access all execution logs at any time.
          </p>
        </div>
      )}
    </div>
  );
}
