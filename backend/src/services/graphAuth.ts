import { Client } from '@microsoft/microsoft-graph-client';
import { ClientSecretCredential, DeviceCodeCredential } from '@azure/identity';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials';
import { prisma } from '../lib/prisma';
import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-key-change-in-production-32b';
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';

// ============================================
// Encryption/Decryption Utilities
// ============================================

function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

function decrypt(encrypted: string): string {
  const parts = encrypted.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encryptedText = parts[2];

  const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

// ============================================
// Microsoft Graph Client Factory
// ============================================

export interface GraphAuthConfig {
  tenantId: string;
  clientId: string;
  clientSecret?: string;
  certificatePath?: string;
  authType: 'APPLICATION' | 'DELEGATED';
  scopes?: string[];
}

export class GraphAuthService {
  /**
   * Get Microsoft Graph client with application (app-only) authentication
   */
  static async getAppOnlyClient(config: GraphAuthConfig): Promise<Client> {
    if (!config.clientSecret && !config.certificatePath) {
      throw new Error('Client secret or certificate required for app-only authentication');
    }

    const credential = new ClientSecretCredential(
      config.tenantId,
      config.clientId,
      config.clientSecret!
    );

    const authProvider = new TokenCredentialAuthenticationProvider(credential, {
      scopes: config.scopes || ['https://graph.microsoft.com/.default'],
    });

    return Client.initWithMiddleware({
      authProvider,
    });
  }

  /**
   * Get Microsoft Graph client with delegated (user) authentication
   */
  static async getDelegatedClient(
    config: GraphAuthConfig,
    onDeviceCodeCallback?: (deviceCodeInfo: any) => void
  ): Promise<Client> {
    const credential = new DeviceCodeCredential({
      tenantId: config.tenantId,
      clientId: config.clientId,
      userPromptCallback: onDeviceCodeCallback || ((info) => {
        console.log(info.message);
      }),
    });

    const authProvider = new TokenCredentialAuthenticationProvider(credential, {
      scopes: config.scopes || [
        'User.Read',
        'User.ReadWrite.All',
        'Group.ReadWrite.All',
        'Directory.ReadWrite.All',
      ],
    });

    return Client.initWithMiddleware({
      authProvider,
    });
  }

  /**
   * Get Graph client from database tenant configuration
   */
  static async getClientFromTenant(
    tenantId: string,
    authType: 'APPLICATION' | 'DELEGATED' = 'APPLICATION',
    onDeviceCodeCallback?: (deviceCodeInfo: any) => void
  ): Promise<Client> {
    // Fetch tenant credentials
    const credential = await prisma.tenantCredential.findFirst({
      where: {
        tenantId,
        credentialType: 'MICROSOFT_GRAPH',
        authType,
        isActive: true,
      },
    });

    if (!credential) {
      throw new Error(`No active ${authType} credentials found for tenant ${tenantId}`);
    }

    if (!credential.tenantIdM365 || !credential.clientId) {
      throw new Error('Incomplete credential configuration');
    }

    const config: GraphAuthConfig = {
      tenantId: credential.tenantIdM365,
      clientId: credential.clientId,
      authType,
    };

    if (authType === 'APPLICATION') {
      if (!credential.clientSecretEnc) {
        throw new Error('Client secret not found for application authentication');
      }
      config.clientSecret = decrypt(credential.clientSecretEnc);
      return this.getAppOnlyClient(config);
    } else {
      return this.getDelegatedClient(config, onDeviceCodeCallback);
    }
  }

  /**
   * Test connection to Microsoft Graph
   */
  static async testConnection(client: Client): Promise<{ success: boolean; error?: string }> {
    try {
      await client.api('/organization').get();
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Store encrypted credentials in database
   */
  static async storeCredentials(data: {
    tenantId: string;
    credentialType: 'MICROSOFT_GRAPH' | 'EXCHANGE_ONLINE' | 'SHAREPOINT_ONLINE' | 'AZURE_AD';
    authType: 'APPLICATION' | 'DELEGATED';
    clientId: string;
    clientSecret?: string;
    certificatePath?: string;
    tenantIdM365: string;
  }) {
    const encryptedData: any = {
      tenantId: data.tenantId,
      credentialType: data.credentialType,
      authType: data.authType,
      clientId: data.clientId,
      tenantIdM365: data.tenantIdM365,
      certificatePath: data.certificatePath,
    };

    if (data.clientSecret) {
      encryptedData.clientSecretEnc = encrypt(data.clientSecret);
    }

    return await prisma.tenantCredential.create({
      data: encryptedData,
    });
  }

  /**
   * Get decrypted client secret
   */
  static async getDecryptedSecret(credentialId: string): Promise<string | null> {
    const credential = await prisma.tenantCredential.findUnique({
      where: { id: credentialId },
    });

    if (!credential || !credential.clientSecretEnc) {
      return null;
    }

    return decrypt(credential.clientSecretEnc);
  }
}

// ============================================
// Common Graph Operations
// ============================================

export class GraphOperations {
  /**
   * Get user details
   */
  static async getUser(client: Client, userPrincipalName: string) {
    return await client.api(`/users/${userPrincipalName}`).get();
  }

  /**
   * Create user
   */
  static async createUser(client: Client, userData: any) {
    return await client.api('/users').post(userData);
  }

  /**
   * Assign license to user
   */
  static async assignLicense(
    client: Client,
    userPrincipalName: string,
    skuId: string,
    disabledPlans: string[] = []
  ) {
    return await client.api(`/users/${userPrincipalName}/assignLicense`).post({
      addLicenses: [
        {
          skuId,
          disabledPlans,
        },
      ],
      removeLicenses: [],
    });
  }

  /**
   * Add user to group
   */
  static async addUserToGroup(client: Client, groupId: string, userId: string) {
    return await client.api(`/groups/${groupId}/members/$ref`).post({
      '@odata.id': `https://graph.microsoft.com/v1.0/directoryObjects/${userId}`,
    });
  }

  /**
   * Get available licenses
   */
  static async getAvailableLicenses(client: Client) {
    return await client.api('/subscribedSkus').get();
  }

  /**
   * Get groups
   */
  static async getGroups(client: Client) {
    return await client.api('/groups').get();
  }

  /**
   * Create group
   */
  static async createGroup(client: Client, groupData: any) {
    return await client.api('/groups').post(groupData);
  }
}

export { encrypt, decrypt };
