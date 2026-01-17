import { Router } from 'express';
import { ConfidentialClientApplication } from '@azure/msal-node';
import { prisma } from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { encrypt, decrypt } from '../services/graphAuth';

export const oauthRouter = Router();

// MSAL configuration - should be set via environment variables
const getMSALConfig = () => {
  return {
    auth: {
      clientId: process.env.OAUTH_CLIENT_ID || '',
      authority: `https://login.microsoftonline.com/common`,
      clientSecret: process.env.OAUTH_CLIENT_SECRET || '',
    },
  };
};

const redirectUri = process.env.OAUTH_REDIRECT_URI || 'http://localhost:3001/api/oauth/callback';

// Scopes for delegated permissions
const scopes = [
  'User.Read',
  'User.ReadWrite.All',
  'Group.ReadWrite.All',
  'Mail.ReadWrite',
  'Mail.Send',
  'Calendars.ReadWrite',
  'offline_access', // Required for refresh token
];

/**
 * Initiate OAuth flow - user clicks "Connect Microsoft Account"
 */
oauthRouter.get('/connect', authenticate, async (req: AuthRequest, res) => {
  try {
    const state = Buffer.from(JSON.stringify({
      userId: req.user!.userId,
      timestamp: Date.now(),
    })).toString('base64');

    const msalConfig = getMSALConfig();
    const pca = new ConfidentialClientApplication(msalConfig);

    const authCodeUrlParameters = {
      scopes,
      redirectUri,
      state,
      prompt: 'consent', // Force consent to ensure refresh token
    };

    const authUrl = await pca.getAuthCodeUrl(authCodeUrlParameters);

    res.json({ authUrl });
  } catch (error) {
    console.error('OAuth connect error:', error);
    res.status(500).json({ error: 'Failed to initiate OAuth flow' });
  }
});

/**
 * OAuth callback - Microsoft redirects here after user authorizes
 */
oauthRouter.get('/callback', async (req, res) => {
  try {
    const { code, state, error: oauthError } = req.query;

    if (oauthError) {
      return res.redirect(`${process.env.CORS_ORIGIN}/profile?error=${oauthError}`);
    }

    if (!code || !state) {
      return res.redirect(`${process.env.CORS_ORIGIN}/profile?error=missing_params`);
    }

    // Decode state to get userId
    const stateData = JSON.parse(Buffer.from(state as string, 'base64').toString());
    const { userId } = stateData;

    const msalConfig = getMSALConfig();
    const pca = new ConfidentialClientApplication(msalConfig);

    // Exchange authorization code for tokens
    const tokenRequest = {
      code: code as string,
      scopes,
      redirectUri,
    };

    const tokenResponse = await pca.acquireTokenByCode(tokenRequest);

    if (!tokenResponse || !tokenResponse.refreshToken) {
      return res.redirect(`${process.env.CORS_ORIGIN}/profile?error=no_refresh_token`);
    }

    // Encrypt tokens
    const refreshTokenEnc = encrypt(tokenResponse.refreshToken);
    const accessTokenEnc = tokenResponse.accessToken ? encrypt(tokenResponse.accessToken) : null;

    // Store in database
    await prisma.userMicrosoftConnection.upsert({
      where: { userId },
      update: {
        refreshTokenEnc,
        accessTokenEnc,
        tokenExpiresAt: tokenResponse.expiresOn || null,
        scope: tokenResponse.scopes?.join(' '),
        microsoftAccountId: tokenResponse.account?.homeAccountId,
        microsoftEmail: tokenResponse.account?.username,
      },
      create: {
        userId,
        refreshTokenEnc,
        accessTokenEnc,
        tokenExpiresAt: tokenResponse.expiresOn || null,
        scope: tokenResponse.scopes?.join(' '),
        microsoftAccountId: tokenResponse.account?.homeAccountId,
        microsoftEmail: tokenResponse.account?.username,
      },
    });

    // Redirect to profile page with success
    res.redirect(`${process.env.CORS_ORIGIN}/profile?connected=true`);
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.redirect(`${process.env.CORS_ORIGIN}/profile?error=auth_failed`);
  }
});

/**
 * Get current user's Microsoft connection status
 */
oauthRouter.get('/status', authenticate, async (req: AuthRequest, res) => {
  try {
    const connection = await prisma.userMicrosoftConnection.findUnique({
      where: { userId: req.user!.userId },
      select: {
        id: true,
        microsoftEmail: true,
        scope: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.json({
      connected: !!connection,
      connection: connection || null,
    });
  } catch (error) {
    console.error('OAuth status error:', error);
    res.status(500).json({ error: 'Failed to get connection status' });
  }
});

/**
 * Disconnect Microsoft account
 */
oauthRouter.delete('/disconnect', authenticate, async (req: AuthRequest, res) => {
  try {
    await prisma.userMicrosoftConnection.delete({
      where: { userId: req.user!.userId },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('OAuth disconnect error:', error);
    res.status(500).json({ error: 'Failed to disconnect account' });
  }
});

/**
 * Get fresh access token using refresh token
 * This is used internally by script execution
 */
export async function getAccessTokenForUser(userId: string): Promise<string | null> {
  try {
    const connection = await prisma.userMicrosoftConnection.findUnique({
      where: { userId },
    });

    if (!connection) {
      return null;
    }

    // Check if cached access token is still valid
    if (connection.accessTokenEnc && connection.tokenExpiresAt) {
      const now = new Date();
      const expiresAt = new Date(connection.tokenExpiresAt);

      // If token expires in more than 5 minutes, use cached token
      if (expiresAt.getTime() - now.getTime() > 5 * 60 * 1000) {
        return decrypt(connection.accessTokenEnc);
      }
    }

    // Token expired or doesn't exist, refresh it
    const refreshToken = decrypt(connection.refreshTokenEnc);

    const msalConfig = getMSALConfig();
    const pca = new ConfidentialClientApplication(msalConfig);

    const refreshRequest = {
      refreshToken,
      scopes,
    };

    const tokenResponse = await pca.acquireTokenByRefreshToken(refreshRequest);

    if (!tokenResponse || !tokenResponse.accessToken) {
      return null;
    }

    // Update cached access token
    const accessTokenEnc = encrypt(tokenResponse.accessToken);
    await prisma.userMicrosoftConnection.update({
      where: { userId },
      data: {
        accessTokenEnc,
        tokenExpiresAt: tokenResponse.expiresOn || null,
      },
    });

    return tokenResponse.accessToken;
  } catch (error) {
    console.error('Error getting access token for user:', error);
    return null;
  }
}
