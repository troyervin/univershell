import { Request, Response, NextFunction } from 'express';
import { verifyToken, JwtPayload } from '../lib/auth';
import { prisma } from '../lib/prisma';

export interface AuthRequest extends Request {
  user?: JwtPayload & {
    roles: string[];
    tenantIds: string[];
    tenantRoles: Record<string, 'ADMIN' | 'USER'>; // tenant-specific roles
  };
}

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);
    const payload = verifyToken(token);

    // Fetch user with roles and tenant access
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                tenantAccess: true
              }
            }
          }
        },
        tenantUsers: {
          where: { isActive: true },
          include: {
            tenant: true
          }
        }
      }
    });

    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Invalid or inactive user' });
    }

    // Extract global roles and accessible tenant IDs from global roles
    const roles = user.userRoles.map(ur => ur.role.name);
    const globalTenantIds = user.userRoles.flatMap(ur =>
      ur.role.tenantAccess.map(ta => ta.tenantId)
    );

    // Extract tenant-specific access and roles
    const tenantSpecificIds = user.tenantUsers.map(tu => tu.tenantId);
    const tenantRoles: Record<string, 'ADMIN' | 'USER'> = {};
    user.tenantUsers.forEach(tu => {
      tenantRoles[tu.tenantId] = tu.role;
    });

    // Combine global and tenant-specific access
    const tenantIds = Array.from(new Set([...globalTenantIds, ...tenantSpecificIds]));

    req.user = {
      ...payload,
      roles,
      tenantIds,
      tenantRoles
    };

    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

export const requireRole = (allowedRoles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const hasRole = req.user.roles.some(role => allowedRoles.includes(role));

    if (!hasRole) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
};

export const requireTenantAccess = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const tenantId = req.params.tenantId || req.body.tenantId;

  if (!tenantId) {
    return res.status(400).json({ error: 'Tenant ID required' });
  }

  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  // Check if user has access to this tenant
  if (!req.user.tenantIds.includes(tenantId)) {
    return res.status(403).json({ error: 'No access to this tenant' });
  }

  next();
};

export const requireTenantAdmin = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const tenantId = req.params.tenantId || req.body.tenantId;

  if (!tenantId) {
    return res.status(400).json({ error: 'Tenant ID required' });
  }

  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  // Global admin has access to all tenants
  if (req.user.roles.includes('admin')) {
    return next();
  }

  // Check if user is tenant admin
  const isTenantAdmin = req.user.tenantRoles[tenantId] === 'ADMIN';

  if (!isTenantAdmin) {
    return res.status(403).json({ error: 'Must be tenant admin' });
  }

  next();
};

export const requireGlobalAdmin = requireRole(['admin']);
