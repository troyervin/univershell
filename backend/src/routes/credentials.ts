import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, AuthRequest, requireTenantAdmin } from '../middleware/auth';
import { encrypt } from '../services/graphAuth';

export const credentialRouter = Router();

// All routes require authentication
credentialRouter.use(authenticate);

// ============================================
// Tenant Credential Management
// ============================================

const createCredentialSchema = z.object({
  tenantId: z.string().uuid(),
  credentialType: z.enum([
    'MICROSOFT_GRAPH',
    'EXCHANGE_ONLINE',
    'SHAREPOINT_ONLINE',
    'AZURE_AD',
    'ACTIVE_DIRECTORY'
  ]),
  authType: z.enum(['APPLICATION', 'DELEGATED']),
  clientId: z.string().min(1),
  clientSecret: z.string().optional(),
  certificatePath: z.string().optional(),
  tenantIdM365: z.string().min(1),
  displayName: z.string().optional(),
  description: z.string().optional(),
});

const updateCredentialSchema = z.object({
  credentialType: z.enum([
    'MICROSOFT_GRAPH',
    'EXCHANGE_ONLINE',
    'SHAREPOINT_ONLINE',
    'AZURE_AD',
    'ACTIVE_DIRECTORY'
  ]).optional(),
  authType: z.enum(['APPLICATION', 'DELEGATED']).optional(),
  clientId: z.string().min(1).optional(),
  clientSecret: z.string().optional(),
  certificatePath: z.string().optional(),
  tenantIdM365: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});

// Get all credentials for a tenant (Tenant Admin or Global Admin)
credentialRouter.get('/tenant/:tenantId', async (req: AuthRequest, res) => {
  try {
    const { tenantId } = req.params;

    // Check if user is tenant admin or global admin
    const isTenantAdmin = req.user!.tenantRoles[tenantId] === 'ADMIN';
    const isGlobalAdmin = req.user!.roles.includes('admin');

    if (!isTenantAdmin && !isGlobalAdmin) {
      return res.status(403).json({ error: 'Must be tenant admin or global admin' });
    }

    const credentials = await prisma.tenantCredential.findMany({
      where: { tenantId },
      select: {
        id: true,
        credentialType: true,
        authType: true,
        clientId: true,
        tenantIdM365: true,
        certificatePath: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        // Don't return encrypted secret
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.json(credentials);
  } catch (error) {
    console.error('Get credentials error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single credential (without secret) - Tenant Admin or Global Admin
credentialRouter.get('/:credentialId', async (req: AuthRequest, res) => {
  try {
    const { credentialId } = req.params;

    const credential = await prisma.tenantCredential.findUnique({
      where: { id: credentialId },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            displayName: true,
          },
        },
      },
    });

    if (!credential) {
      return res.status(404).json({ error: 'Credential not found' });
    }

    // Check if user is tenant admin or global admin
    const isTenantAdmin = req.user!.tenantRoles[credential.tenantId] === 'ADMIN';
    const isGlobalAdmin = req.user!.roles.includes('admin');

    if (!isTenantAdmin && !isGlobalAdmin) {
      return res.status(403).json({ error: 'Must be tenant admin or global admin' });
    }

    // Remove encrypted secret from response
    const { clientSecretEnc, ...credentialWithoutSecret } = credential;

    res.json(credentialWithoutSecret);
  } catch (error) {
    console.error('Get credential error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create credential (Tenant Admin or Global Admin)
credentialRouter.post('/', async (req: AuthRequest, res) => {
  try {
    const data = createCredentialSchema.parse(req.body);

    // Check if user is tenant admin or global admin
    const isTenantAdmin = req.user!.tenantRoles[data.tenantId] === 'ADMIN';
    const isGlobalAdmin = req.user!.roles.includes('admin');

    if (!isTenantAdmin && !isGlobalAdmin) {
      return res.status(403).json({ error: 'Must be tenant admin or global admin' });
    }

    // Verify tenant exists
    const tenant = await prisma.tenant.findUnique({
      where: { id: data.tenantId },
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Encrypt client secret if provided
    let encryptedSecret: string | undefined;
    if (data.clientSecret) {
      encryptedSecret = encrypt(data.clientSecret);
    }

    const credential = await prisma.tenantCredential.create({
      data: {
        tenantId: data.tenantId,
        credentialType: data.credentialType,
        authType: data.authType,
        clientId: data.clientId,
        clientSecretEnc: encryptedSecret,
        certificatePath: data.certificatePath,
        tenantIdM365: data.tenantIdM365,
      },
      select: {
        id: true,
        credentialType: true,
        authType: true,
        clientId: true,
        tenantIdM365: true,
        certificatePath: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.status(201).json(credential);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Create credential error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update credential (Tenant Admin or Global Admin)
credentialRouter.patch('/:credentialId', async (req: AuthRequest, res) => {
  try {
    const { credentialId } = req.params;
    const data = updateCredentialSchema.parse(req.body);

    // Get existing credential to check tenant
    const existingCredential = await prisma.tenantCredential.findUnique({
      where: { id: credentialId },
    });

    if (!existingCredential) {
      return res.status(404).json({ error: 'Credential not found' });
    }

    // Check if user is tenant admin or global admin
    const isTenantAdmin = req.user!.tenantRoles[existingCredential.tenantId] === 'ADMIN';
    const isGlobalAdmin = req.user!.roles.includes('admin');

    if (!isTenantAdmin && !isGlobalAdmin) {
      return res.status(403).json({ error: 'Must be tenant admin or global admin' });
    }

    // Prepare update data
    const updateData: any = {
      ...(data.credentialType && { credentialType: data.credentialType }),
      ...(data.authType && { authType: data.authType }),
      ...(data.clientId && { clientId: data.clientId }),
      ...(data.certificatePath !== undefined && { certificatePath: data.certificatePath }),
      ...(data.tenantIdM365 && { tenantIdM365: data.tenantIdM365 }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
    };

    // Encrypt new client secret if provided
    if (data.clientSecret) {
      updateData.clientSecretEnc = encrypt(data.clientSecret);
    }

    const credential = await prisma.tenantCredential.update({
      where: { id: credentialId },
      data: updateData,
      select: {
        id: true,
        credentialType: true,
        authType: true,
        clientId: true,
        tenantIdM365: true,
        certificatePath: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.json(credential);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Update credential error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete credential (Tenant Admin or Global Admin)
credentialRouter.delete('/:credentialId', async (req: AuthRequest, res) => {
  try {
    const { credentialId } = req.params;

    // Get existing credential to check tenant
    const existingCredential = await prisma.tenantCredential.findUnique({
      where: { id: credentialId },
    });

    if (!existingCredential) {
      return res.status(404).json({ error: 'Credential not found' });
    }

    // Check if user is tenant admin or global admin
    const isTenantAdmin = req.user!.tenantRoles[existingCredential.tenantId] === 'ADMIN';
    const isGlobalAdmin = req.user!.roles.includes('admin');

    if (!isTenantAdmin && !isGlobalAdmin) {
      return res.status(403).json({ error: 'Must be tenant admin or global admin' });
    }

    await prisma.tenantCredential.delete({
      where: { id: credentialId },
    });

    res.status(204).send();
  } catch (error) {
    console.error('Delete credential error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Test credential connection (Tenant Admin or Global Admin)
credentialRouter.post('/:credentialId/test', async (req: AuthRequest, res) => {
  try {
    const { credentialId } = req.params;

    const credential = await prisma.tenantCredential.findUnique({
      where: { id: credentialId },
    });

    if (!credential) {
      return res.status(404).json({ error: 'Credential not found' });
    }

    // Check if user is tenant admin or global admin
    const isTenantAdmin = req.user!.tenantRoles[credential.tenantId] === 'ADMIN';
    const isGlobalAdmin = req.user!.roles.includes('admin');

    if (!isTenantAdmin && !isGlobalAdmin) {
      return res.status(403).json({ error: 'Must be tenant admin or global admin' });
    }

    // Test the connection (implementation depends on credential type)
    // For now, return a placeholder
    // TODO: Implement actual connection testing using GraphAuthService

    res.json({
      success: true,
      message: 'Credential test not yet implemented',
      credentialId,
    });
  } catch (error) {
    console.error('Test credential error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Toggle credential active status (Tenant Admin or Global Admin)
credentialRouter.post('/:credentialId/toggle', async (req: AuthRequest, res) => {
  try {
    const { credentialId } = req.params;

    const credential = await prisma.tenantCredential.findUnique({
      where: { id: credentialId },
    });

    if (!credential) {
      return res.status(404).json({ error: 'Credential not found' });
    }

    // Check if user is tenant admin or global admin
    const isTenantAdmin = req.user!.tenantRoles[credential.tenantId] === 'ADMIN';
    const isGlobalAdmin = req.user!.roles.includes('admin');

    if (!isTenantAdmin && !isGlobalAdmin) {
      return res.status(403).json({ error: 'Must be tenant admin or global admin' });
    }

    const updatedCredential = await prisma.tenantCredential.update({
      where: { id: credentialId },
      data: {
        isActive: !credential.isActive,
      },
      select: {
        id: true,
        credentialType: true,
        authType: true,
        clientId: true,
        tenantIdM365: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.json(updatedCredential);
  } catch (error) {
    console.error('Toggle credential error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
