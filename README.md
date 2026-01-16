# Univershell

**Multi-tenant PowerShell Management Platform for Active Directory and Microsoft 365**

Univershell is a modern web-based platform for managing multiple Active Directory and Microsoft 365 tenants through PowerShell scripts and workflows. It provides granular role-based access control, script management, workflow orchestration, and comprehensive audit logging.

## Features

### Core Capabilities
- **Multi-Tenant Management**: Manage multiple AD and M365 tenants from a single interface
- **Three-Tier Role System**: Global admins, tenant admins, and tenant users with granular permissions
- **Group-Based Access Control**: Organize users into tenant-specific groups and assign scripts/workflows to groups
- **Script Library**: Create, manage, and execute PowerShell scripts
- **Workflow Engine**: Chain multiple scripts together with variable passing between steps
- **Execution History**: Complete audit trail of all script and workflow executions
- **Microsoft Graph Integration**: Built-in support for both application (app-only) and delegated authentication
- **Tenant-Specific Administration**: Each tenant can have its own admins who manage users and groups within their tenant only

### Security Features
- JWT-based authentication
- Encrypted credential storage
- Role-based tenant access control
- Comprehensive audit logging
- Rate limiting and request validation

### Use Cases
- Automated user onboarding across multiple tenants
- Centralized AD and M365 management
- Tenant-specific automation workflows
- Compliance and audit requirements
- Multi-organization IT service providers

## Role-Based Access Control (RBAC)

Univershell implements a sophisticated three-tier RBAC system:

### 1. Global Roles (System-Wide)
- **Global Admin**: Full control over entire system, all tenants, and all configurations
- **Script Manager**: Create and manage scripts across all tenants
- **Workflow Manager**: Create and manage workflows
- **Operator**: Execute scripts and workflows
- **Viewer**: Read-only access to execution logs

### 2. Tenant Roles (Tenant-Specific)
- **Tenant Admin**: Full control within their assigned tenant(s)
  - Manage tenant users and groups
  - Assign scripts/workflows to groups
  - Cannot access other tenants unless explicitly granted
- **Tenant User**: Regular user within a tenant
  - Can only execute scripts/workflows assigned to their groups
  - Cannot manage users or groups

### 3. Group-Based Access
- Users are organized into **Tenant Groups** (e.g., "IT Support", "HR", "Developers")
- Scripts and workflows are assigned to groups, not individual users
- Users inherit access to scripts/workflows through group membership

### Example Scenario

**Multi-tenant MSP managing Grey Owl and Onni:**

```
Global Admin (You)
  ├── Grey Owl Tenant
  │   ├── Grey Owl Admin (Sarah)
  │   │   ├── Can manage Grey Owl users/groups
  │   │   ├── Can assign scripts to Grey Owl groups
  │   │   └── Cannot see Onni tenant
  │   ├── Groups:
  │   │   ├── "Grey Owl IT" → Assigned: Password Reset, User Creation scripts
  │   │   └── "Grey Owl HR" → Assigned: Onboarding Workflow
  │   └── Users: IT staff, HR staff
  │
  └── Onni Tenant
      ├── Onni Admin (Mike)
      │   ├── Can manage Onni users/groups
      │   ├── Can assign scripts to Onni groups
      │   └── Cannot see Grey Owl tenant
      ├── Groups:
      │   ├── "Onni IT" → Assigned: Different password policy script
      │   └── "Onni HR" → Assigned: Different onboarding workflow
      └── Users: IT staff, HR staff
```

**Key Benefits:**
- Sarah (Grey Owl Admin) cannot access or modify Onni tenant
- Mike (Onni Admin) cannot access or modify Grey Owl tenant
- Different onboarding workflows for each tenant
- Global Admin can manage both tenants
- Users can be granted access to multiple tenants if needed

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React)                        │
│  - Dashboard, Scripts, Workflows, Tenants, Executions       │
└─────────────────────────────────────────────────────────────┘
                            │
                            ↓ (REST API)
┌─────────────────────────────────────────────────────────────┐
│                  Backend (Node.js + Express)                │
│  - Auth, Users, Roles, Tenants, Scripts, Workflows         │
└─────────────────────────────────────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              ↓                           ↓
    ┌──────────────────┐        ┌──────────────────┐
    │  PostgreSQL DB   │        │  PowerShell Core │
    │  (User/Role/     │        │  (Script Engine) │
    │   Tenant Data)   │        │                  │
    └──────────────────┘        └──────────────────┘
```

## Tech Stack

### Backend
- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: JWT + bcryptjs
- **Validation**: Zod
- **PowerShell**: PowerShell Core 7+
- **Microsoft Graph**: @microsoft/microsoft-graph-client + @azure/identity

### Frontend
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Routing**: React Router v6
- **State Management**: Zustand
- **Styling**: Tailwind CSS
- **HTTP Client**: Axios
- **Forms**: React Hook Form + Zod

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** 18+ (with npm)
- **PostgreSQL** 14+
- **PowerShell Core** 7+ (`pwsh`)
- **Git**

### Install PowerShell Core

**Linux:**
```bash
# Ubuntu/Debian
sudo apt-get install -y powershell

# Or download from: https://github.com/PowerShell/PowerShell/releases
```

**macOS:**
```bash
brew install --cask powershell
```

**Windows:**
PowerShell Core is included by default in modern Windows, or download from Microsoft.

Verify installation:
```bash
pwsh --version
```

## Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd univershell
```

### 2. Install Dependencies

```bash
# Install root dependencies
npm install

# This will automatically install both backend and frontend dependencies
```

### 3. Set Up Database

Create a PostgreSQL database:

```bash
# Connect to PostgreSQL
psql -U postgres

# Create database and user
CREATE DATABASE univershell;
CREATE USER univershell WITH PASSWORD 'your_password_here';
GRANT ALL PRIVILEGES ON DATABASE univershell TO univershell;
\q
```

### 4. Configure Environment Variables

Create a `.env` file in the `backend` directory:

```bash
cd backend
cp .env.example .env
```

Edit `.env` with your settings:

```env
DATABASE_URL="postgresql://univershell:your_password_here@localhost:5432/univershell?schema=public"
JWT_SECRET="your-super-secret-jwt-key-change-this"
JWT_EXPIRES_IN="7d"
PORT=3001
NODE_ENV="development"
CORS_ORIGIN="http://localhost:5173"
POWERSHELL_TIMEOUT=300000
```

**Important**: Generate a secure JWT secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 5. Initialize Database

```bash
# From the backend directory
cd backend

# Generate Prisma client
npm run prisma:generate

# Run migrations
npm run prisma:migrate

# Seed database with initial data
npm run prisma:seed
```

This will create:
- Default roles: `admin`, `script_manager`, `workflow_manager`, `operator`, `viewer`
- Admin user: `admin` / `admin123`
- Example tenants: Grey Owl, Onni
- Example script: Get PowerShell Version

### 6. Start Development Servers

From the root directory:

```bash
# Start both backend and frontend concurrently
npm run dev
```

Or start them separately:

```bash
# Terminal 1 - Backend
npm run dev:backend

# Terminal 2 - Frontend
npm run dev:frontend
```

### 7. Access the Application

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3001
- **Health Check**: http://localhost:3001/health

**Default Login:**
- Username: `admin`
- Password: `admin123`

**⚠️ IMPORTANT**: Change the admin password immediately after first login!

## Usage Guide

### Managing Tenants

1. Navigate to **Tenants** page
2. View all tenants you have access to
3. Click on a tenant to select it as the active tenant
4. All scripts and workflows will execute against the selected tenant

### Creating Scripts

Scripts can be:
- **Global**: Available to all tenants
- **Tenant-Specific**: Only available to assigned tenants

Example PowerShell script structure:

```powershell
# Variables are automatically injected
# Use $variableName to access them

# Example: Create AD User
New-ADUser -Name $UserName -GivenName $FirstName -Surname $LastName

# Return data as JSON for use in workflows
@{
    UserPrincipalName = "$UserName@domain.com"
    ObjectGuid = $user.ObjectGuid
} | ConvertTo-Json
```

### Creating Workflows

Workflows chain multiple scripts together:

1. **Step 1**: Create AD User
   - Outputs: `UserPrincipalName`, `ObjectGuid`

2. **Step 2**: Assign M365 License
   - Variable Mapping: `UserPrincipalName` → `UserEmail`
   - Uses the output from Step 1 as input

### Variable Passing Between Scripts

In workflow configuration, map output variables to input variables:

```json
{
  "variableMapping": {
    "UserPrincipalName": "UserEmail",
    "ObjectGuid": "ADObjectId"
  }
}
```

The workflow engine automatically:
1. Executes scripts in order
2. Captures output from each script
3. Maps variables to next script's inputs
4. Handles errors based on `continueOnError` setting

## API Documentation

### Authentication

```bash
# Login
POST /api/auth/login
{
  "username": "admin",
  "password": "admin123"
}

# Register (if enabled)
POST /api/auth/register
{
  "username": "newuser",
  "email": "user@example.com",
  "password": "securepassword"
}
```

### Scripts

```bash
# List scripts
GET /api/scripts?tenantId={id}

# Execute script
POST /api/executions/script
{
  "scriptId": "uuid",
  "tenantId": "uuid",
  "parameters": {
    "paramName": "value"
  }
}
```

### Workflows

```bash
# List workflows
GET /api/workflows?tenantId={id}

# Execute workflow
POST /api/executions/workflow
{
  "workflowId": "uuid",
  "tenantId": "uuid",
  "parameters": {
    "paramName": "value"
  }
}
```

### Execution History

```bash
# Get execution history
GET /api/executions/history?tenantId={id}&limit=50
```

## Database Schema

Key models:

**Global Authorization:**
- **User**: User accounts
- **Role**: Global permission roles
- **UserRole**: User-to-global-role assignments
- **Tenant**: AD/M365 tenant configurations
- **TenantAccess**: Global role-to-tenant access mapping

**Tenant-Level Authorization:**
- **TenantUser**: User-to-tenant assignments with tenant-specific roles (ADMIN or USER)
- **TenantGroup**: Groups within a tenant (e.g., "IT Support", "HR")
- **TenantGroupMember**: User memberships in tenant groups

**Script & Workflow Management:**
- **Script**: PowerShell scripts
- **ScriptTenantAssignment**: Script-to-tenant assignments
- **ScriptGroupAssignment**: Script-to-group assignments (NEW)
- **Workflow**: Script orchestration workflows
- **WorkflowStep**: Individual workflow steps
- **WorkflowGroupAssignment**: Workflow-to-group assignments (NEW)

**Credentials & Security:**
- **TenantCredential**: Encrypted Microsoft Graph credentials (app-only and delegated)

**Audit & Logging:**
- **ExecutionLog**: Complete audit trail of all executions

## Security Considerations

### Production Deployment

1. **Change Default Credentials**: Update admin password immediately
2. **Use Strong JWT Secret**: Generate a cryptographically secure secret
3. **Enable HTTPS**: Always use TLS in production
4. **Secure Database**: Use strong passwords and restrict access
5. **Environment Variables**: Never commit `.env` files
6. **Azure Key Vault**: Use for credential storage in production
7. **Rate Limiting**: Configure appropriate limits
8. **Input Validation**: All inputs are validated via Zod schemas

### PowerShell Execution Security

- Scripts run in isolated PowerShell sessions
- Environment variables include tenant/user context
- Timeout limits prevent runaway processes
- All executions are logged for audit

## Troubleshooting

### PowerShell Not Found

```bash
# Verify PowerShell Core is installed
pwsh --version

# If not found, install PowerShell Core
# Linux: sudo apt-get install -y powershell
# macOS: brew install --cask powershell
```

### Database Connection Issues

```bash
# Verify PostgreSQL is running
sudo systemctl status postgresql

# Test connection
psql -U univershell -d univershell -h localhost
```

### Port Already in Use

```bash
# Change ports in .env (backend) and vite.config.ts (frontend)
PORT=3002  # backend
# frontend: edit vite.config.ts server.port
```

## Development

### Database Management

```bash
# Generate Prisma client after schema changes
npm run prisma:generate

# Create a new migration
npm run prisma:migrate

# View database in Prisma Studio
npm run prisma:studio

# Reset database (development only)
npx prisma migrate reset
```

### Building for Production

```bash
# Build both frontend and backend
npm run build

# Start production server
cd backend && npm start
```

## Additional Documentation

### Tenant Administration Guide
For detailed information about:
- Setting up tenant-level administrators
- Creating and managing tenant groups
- Assigning scripts/workflows to groups
- Configuring Microsoft Graph authentication (app-only and delegated)
- Multi-tenant workflows with variable passing

See: **[TENANT_ADMIN_GUIDE.md](./TENANT_ADMIN_GUIDE.md)**

### Quick Reference

**New API Endpoints:**
- `/api/tenant-admin/:tenantId/users` - Manage users within a tenant
- `/api/tenant-admin/:tenantId/groups` - Manage tenant groups
- `/api/tenant-admin/:tenantId/groups/:groupId/members` - Manage group members
- `/api/script-groups/assign` - Assign scripts to groups
- `/api/script-groups/my-scripts` - Get scripts available to current user
- `/api/script-groups/assign-workflow` - Assign workflows to groups

## Contributing

This is a concept application. For production use, consider:
- Comprehensive error handling
- Unit and integration tests
- CI/CD pipeline
- Container orchestration (Docker/Kubernetes)
- Monitoring and logging (Prometheus, Grafana)
- Backup and disaster recovery

## License

MIT

## Support

For issues and questions, please open a GitHub issue.

---

**Built with ❤️ for IT automation professionals**