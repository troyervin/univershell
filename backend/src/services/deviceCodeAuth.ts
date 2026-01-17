import { ConfidentialClientApplication, DeviceCodeResponse } from '@azure/msal-node';

// In-memory storage for device code authentication requests
// In production, this should use Redis or similar
interface DeviceCodeRequest {
  requestId: string;
  userId: string;
  tenantId: string;
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
  startedAt: number;
  accessToken?: string;
  completed: boolean;
  error?: string;
}

const deviceCodeRequests = new Map<string, DeviceCodeRequest>();

// Scopes for delegated permissions
const scopes = [
  'User.Read',
  'User.ReadWrite.All',
  'Group.ReadWrite.All',
  'Mail.ReadWrite',
  'Mail.Send',
  'Calendars.ReadWrite',
  'offline_access',
];

const getMSALConfig = () => {
  return {
    auth: {
      clientId: process.env.OAUTH_CLIENT_ID || '',
      authority: `https://login.microsoftonline.com/common`,
      clientSecret: process.env.OAUTH_CLIENT_SECRET || '',
    },
  };
};

/**
 * Initiates a device code flow for delegated authentication
 */
export async function initiateDeviceCodeFlow(
  userId: string,
  tenantId: string
): Promise<DeviceCodeRequest> {
  const requestId = `${userId}-${Date.now()}`;

  try {
    const msalConfig = getMSALConfig();
    const pca = new ConfidentialClientApplication(msalConfig);

    // Request device code
    const deviceCodeRequest = {
      deviceCodeCallback: (response: DeviceCodeResponse) => {
        // This callback is called immediately with device code info
        console.log('Device code response:', response.message);
      },
      scopes,
    };

    const response = await pca.acquireTokenByDeviceCode(deviceCodeRequest);

    // The acquireTokenByDeviceCode actually waits for user to authenticate
    // We need to use a different approach - call the device code endpoint directly

    // For now, let's use a polling approach
    // Create a pending request
    const request: DeviceCodeRequest = {
      requestId,
      userId,
      tenantId,
      deviceCode: '', // Will be populated by the device code response
      userCode: '',
      verificationUri: 'https://microsoft.com/devicelogin',
      expiresIn: 900, // 15 minutes
      interval: 5, // Poll every 5 seconds
      startedAt: Date.now(),
      completed: false,
    };

    deviceCodeRequests.set(requestId, request);

    // Start the device code flow in the background
    acquireTokenWithDeviceCode(requestId, pca, deviceCodeRequest);

    return request;
  } catch (error: any) {
    throw new Error(`Failed to initiate device code flow: ${error.message}`);
  }
}

/**
 * Background process to acquire token with device code
 */
async function acquireTokenWithDeviceCode(
  requestId: string,
  pca: ConfidentialClientApplication,
  deviceCodeRequest: any
): Promise<void> {
  try {
    const response = await pca.acquireTokenByDeviceCode(deviceCodeRequest);

    const request = deviceCodeRequests.get(requestId);
    if (request && response && response.accessToken) {
      request.accessToken = response.accessToken;
      request.completed = true;
    }
  } catch (error: any) {
    const request = deviceCodeRequests.get(requestId);
    if (request) {
      request.error = error.message;
      request.completed = true;
    }
  }
}

/**
 * Polls the status of a device code authentication request
 */
export function pollDeviceCodeStatus(requestId: string): {
  status: 'pending' | 'completed' | 'expired' | 'error';
  accessToken?: string;
  error?: string;
  userCode?: string;
  verificationUri?: string;
  expiresIn?: number;
} {
  const request = deviceCodeRequests.get(requestId);

  if (!request) {
    return { status: 'error', error: 'Request not found' };
  }

  // Check if expired
  const now = Date.now();
  const elapsed = (now - request.startedAt) / 1000;
  if (elapsed > request.expiresIn) {
    deviceCodeRequests.delete(requestId);
    return { status: 'expired' };
  }

  // Check if completed
  if (request.completed) {
    if (request.error) {
      deviceCodeRequests.delete(requestId);
      return { status: 'error', error: request.error };
    }

    if (request.accessToken) {
      const token = request.accessToken;
      deviceCodeRequests.delete(requestId);
      return { status: 'completed', accessToken: token };
    }
  }

  // Still pending
  return {
    status: 'pending',
    userCode: request.userCode,
    verificationUri: request.verificationUri,
    expiresIn: Math.floor(request.expiresIn - elapsed),
  };
}

/**
 * Improved device code flow using direct HTTP calls to Microsoft
 */
export async function initiateDeviceCodeFlowV2(
  userId: string,
  tenantId: string
): Promise<{
  requestId: string;
  userCode: string;
  deviceCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
  message: string;
}> {
  const requestId = `${userId}-${Date.now()}`;
  const clientId = process.env.OAUTH_CLIENT_ID || '';

  try {
    // Call Microsoft device code endpoint directly
    const response = await fetch(
      'https://login.microsoftonline.com/common/oauth2/v2.0/devicecode',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: clientId,
          scope: scopes.join(' '),
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Device code request failed: ${response.statusText}`);
    }

    const data = await response.json();

    // Store the request for polling
    const request: DeviceCodeRequest = {
      requestId,
      userId,
      tenantId,
      deviceCode: data.device_code,
      userCode: data.user_code,
      verificationUri: data.verification_uri,
      expiresIn: data.expires_in,
      interval: data.interval || 5,
      startedAt: Date.now(),
      completed: false,
    };

    deviceCodeRequests.set(requestId, request);

    return {
      requestId,
      userCode: data.user_code,
      deviceCode: data.device_code,
      verificationUri: data.verification_uri,
      expiresIn: data.expires_in,
      interval: data.interval || 5,
      message: data.message,
    };
  } catch (error: any) {
    throw new Error(`Failed to initiate device code flow: ${error.message}`);
  }
}

/**
 * Polls Microsoft to check if user has authenticated with device code
 */
export async function pollDeviceCodeStatusV2(requestId: string): Promise<{
  status: 'pending' | 'completed' | 'expired' | 'error';
  accessToken?: string;
  error?: string;
}> {
  const request = deviceCodeRequests.get(requestId);

  if (!request) {
    return { status: 'error', error: 'Request not found' };
  }

  // Check if expired
  const now = Date.now();
  const elapsed = (now - request.startedAt) / 1000;
  if (elapsed > request.expiresIn) {
    deviceCodeRequests.delete(requestId);
    return { status: 'expired' };
  }

  // If already completed, return cached result
  if (request.completed) {
    if (request.error) {
      deviceCodeRequests.delete(requestId);
      return { status: 'error', error: request.error };
    }

    if (request.accessToken) {
      const token = request.accessToken;
      deviceCodeRequests.delete(requestId);
      return { status: 'completed', accessToken: token };
    }
  }

  // Poll Microsoft for token
  const clientId = process.env.OAUTH_CLIENT_ID || '';
  const clientSecret = process.env.OAUTH_CLIENT_SECRET || '';

  try {
    const response = await fetch(
      'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          client_id: clientId,
          client_secret: clientSecret,
          device_code: request.deviceCode,
        }),
      }
    );

    const data = await response.json();

    if (response.ok && data.access_token) {
      // Success - user authenticated
      request.accessToken = data.access_token;
      request.completed = true;

      const token = data.access_token;
      deviceCodeRequests.delete(requestId);
      return { status: 'completed', accessToken: token };
    }

    // Check for specific error codes
    if (data.error === 'authorization_pending') {
      // Still waiting for user to authenticate
      return { status: 'pending' };
    }

    if (data.error === 'authorization_declined') {
      request.error = 'User declined authorization';
      request.completed = true;
      deviceCodeRequests.delete(requestId);
      return { status: 'error', error: 'User declined authorization' };
    }

    if (data.error === 'expired_token') {
      deviceCodeRequests.delete(requestId);
      return { status: 'expired' };
    }

    // Other errors
    request.error = data.error_description || data.error;
    request.completed = true;
    deviceCodeRequests.delete(requestId);
    return { status: 'error', error: request.error };

  } catch (error: any) {
    console.error('Device code polling error:', error);
    return { status: 'error', error: error.message };
  }
}

/**
 * Cleanup expired requests (should be called periodically)
 */
export function cleanupExpiredRequests(): void {
  const now = Date.now();
  for (const [requestId, request] of deviceCodeRequests.entries()) {
    const elapsed = (now - request.startedAt) / 1000;
    if (elapsed > request.expiresIn) {
      deviceCodeRequests.delete(requestId);
    }
  }
}

// Cleanup every 5 minutes
setInterval(cleanupExpiredRequests, 5 * 60 * 1000);
