# Tenant Administration Guide

This guide explains how to use Univershell's multi-level role-based access control (RBAC) system with tenant-specific administration and group management.

## Role Hierarchy

Univershell now supports a three-tier role system:

### 1. Global Roles (System-Wide)
- **Global Admin**: Full control over all tenants and system-wide configuration
- **Script Manager**: Can create and manage scripts across tenants
- **Workflow Manager**: Can create and manage workflows
- **Operator**: Can execute scripts and workflows
- **Viewer**: Read-only access

### 2. Tenant Roles (Tenant-Specific)
- **Tenant Admin**: Full control within a specific tenant (can manage users, groups, and script assignments for that tenant only)
- **Tenant User**: Regular user within a tenant (can only access scripts/workflows assigned to their groups)

### 3. Group-Based Access
- Users are assigned to **Tenant Groups**
- Scripts and workflows are assigned to groups
- Users can only execute scripts/workflows assigned to groups they're members of

## Architecture Overview

```
Global Admin
  ├── Can manage all tenants
  ├── Can create tenants
  └── Can assign tenant admins

Tenant Admin (Grey Owl)
  ├── Can manage users in Grey Owl tenant
  ├── Can create/manage groups in Grey Owl
  ├── Can assign scripts to Grey Owl groups
  └── Cannot access Onni tenant

Tenant Admin (Onni)
  ├── Can manage users in Onni tenant
  ├── Can create/manage groups in Onni
  ├── Can assign scripts to Onni groups
  └── Cannot access Grey Owl tenant

Tenant User (Member of "Onni IT Support" group)
  ├── Can execute scripts assigned to "Onni IT Support" group
  ├── Can execute workflows assigned to "Onni IT Support" group
  └── Cannot execute scripts assigned to other groups
```

## Setting Up Tenant Administration

### Step 1: Create a Tenant (Global Admin Only)

```bash
POST /api/tenants
{
  "name": "grey-owl",
  "displayName": "Grey Owl",
  "description": "Grey Owl tenant for AD and M365 management",
  "type": "HYBRID",
  "config": {
    "domain": "greyowl.local"
  }
}
```

### Step 2: Add a Tenant Admin

```bash
# First, create the user (or use existing user)
POST /api/auth/register
{
  "username": "greyowl-admin",
  "email": "admin@greyowl.com",
  "password": "secure-password"
}

# Then assign them as tenant admin
POST /api/tenant-admin/{tenantId}/users
{
  "userId": "user-uuid",
  "tenantId": "tenant-uuid",
  "role": "ADMIN"
}
```

### Step 3: Create Tenant Groups

As a **Tenant Admin**, you can create groups within your tenant:

```bash
POST /api/tenant-admin/{tenantId}/groups
{
  "name": "it-support",
  "displayName": "IT Support Team",
  "description": "Helpdesk and IT support staff"
}
```

### Step 4: Add Users to Groups

```bash
# Add user to tenant first
POST /api/tenant-admin/{tenantId}/users
{
  "userId": "user-uuid",
  "tenantId": "tenant-uuid",
  "role": "USER"
}

# Then add to group
POST /api/tenant-admin/{tenantId}/groups/{groupId}/members
{
  "userId": "user-uuid"
}
```

### Step 5: Assign Scripts to Groups

```bash
POST /api/script-groups/assign
{
  "scriptId": "script-uuid",
  "groupId": "group-uuid",
  "config": {
    "allowedParameters": ["UserName", "Email"]
  }
}
```

## Common Scenarios

### Scenario 1: Multi-Tenant Service Provider

You manage IT for both **Grey Owl** and **Onni** companies.

**Setup:**
1. Create two tenants: `grey-owl` and `onni`
2. Create tenant admins for each:
   - Sarah (Grey Owl Tenant Admin)
   - Mike (Onni Tenant Admin)
3. Sarah can only manage Grey Owl users and groups
4. Mike can only manage Onni users and groups

**Result:**
- Sarah cannot see or modify anything in Onni
- Mike cannot see or modify anything in Grey Owl
- Global Admin can see and manage both

### Scenario 2: Different Onboarding Scripts Per Tenant

Grey Owl and Onni have different onboarding processes.

**Setup:**
1. Create script: "Grey Owl User Onboarding"
   - Assign to Grey Owl tenant
   - Assign to "Grey Owl HR" group

2. Create script: "Onni User Onboarding"
   - Assign to Onni tenant
   - Assign to "Onni HR" group

3. Users in Grey Owl HR group can only run Grey Owl onboarding
4. Users in Onni HR group can only run Onni onboarding

### Scenario 3: Contractor with Limited Access

You have a contractor who should only access specific scripts in Grey Owl.

**Setup:**
1. Create user account for contractor
2. Add contractor to Grey Owl tenant as "USER" (not ADMIN)
3. Create group "Contractors" in Grey Owl
4. Add contractor to "Contractors" group
5. Assign only specific scripts to "Contractors" group

**Result:**
- Contractor can only execute scripts assigned to their group
- Contractor cannot create/modify scripts or groups
- Contractor cannot access other tenants

### Scenario 4: User with Access to Multiple Tenants

You have a user who needs access to both Grey Owl and Onni tenants.

**Setup:**
```bash
# Add user to Grey Owl tenant
POST /api/tenant-admin/grey-owl-tenant-id/users
{
  "userId": "user-uuid",
  "role": "USER"
}

# Add user to Onni tenant
POST /api/tenant-admin/onni-tenant-id/users
{
  "userId": "user-uuid",
  "role": "USER"
}

# Add to groups in each tenant
POST /api/tenant-admin/grey-owl-tenant-id/groups/grey-owl-group-id/members
{ "userId": "user-uuid" }

POST /api/tenant-admin/onni-tenant-id/groups/onni-group-id/members
{ "userId": "user-uuid" }
```

**Result:**
- User can switch between Grey Owl and Onni tenants in the UI
- User can execute scripts assigned to their groups in both tenants

## Microsoft Graph Integration

### Setting Up Application Authentication (App-Only)

For automated scripts that don't require user interaction:

```bash
POST /api/tenants/{tenantId}/credentials
{
  "credentialType": "MICROSOFT_GRAPH",
  "authType": "APPLICATION",
  "clientId": "your-azure-app-client-id",
  "clientSecret": "your-client-secret",
  "tenantIdM365": "your-m365-tenant-id"
}
```

**Azure AD App Registration Requirements:**
1. Create app registration in Azure Portal
2. Add application permissions (not delegated):
   - User.Read.All
   - Group.ReadWrite.All
   - Directory.ReadWrite.All
3. Grant admin consent
4. Create client secret

### Setting Up Delegated Authentication

For scripts that require user consent:

```bash
POST /api/tenants/{tenantId}/credentials
{
  "credentialType": "MICROSOFT_GRAPH",
  "authType": "DELEGATED",
  "clientId": "your-azure-app-client-id",
  "tenantIdM365": "your-m365-tenant-id"
}
```

**Azure AD App Registration Requirements:**
1. Create app registration in Azure Portal
2. Add delegated permissions:
   - User.Read
   - User.ReadWrite
   - Mail.Send
   - etc.
3. Add redirect URI for device code flow
4. Enable public client flows

### Using Graph API in Scripts

Example PowerShell script using app-only auth:

```powershell
# This variable is automatically injected by Univershell
# $GraphToken contains the access token

# Create new user in M365
$headers = @{
    "Authorization" = "Bearer $GraphToken"
    "Content-Type" = "application/json"
}

$body = @{
    accountEnabled = $true
    displayName = $DisplayName
    mailNickname = $MailNickname
    userPrincipalName = "$MailNickname@$Domain"
    passwordProfile = @{
        forceChangePasswordNextSignIn = $true
        password = $TempPassword
    }
} | ConvertTo-Json

$response = Invoke-RestMethod -Uri "https://graph.microsoft.com/v1.0/users" `
    -Method POST -Headers $headers -Body $body

# Return user details for next workflow step
$response | Select-Object id, userPrincipalName | ConvertTo-Json
```

## Workflow Example: Multi-Step Onboarding

Create a workflow that passes variables between steps:

**Workflow: "Onni Employee Onboarding"**

**Step 1: Create AD User**
```powershell
# Script: Create-ADUser
param(
    [string]$FirstName,
    [string]$LastName,
    [string]$Department
)

$UserName = "$FirstName.$LastName"
New-ADUser -Name "$FirstName $LastName" -GivenName $FirstName -Surname $LastName `
    -SamAccountName $UserName -Department $Department

# Return variables for next step
@{
    UserPrincipalName = "$UserName@onni.local"
    SamAccountName = $UserName
    Department = $Department
} | ConvertTo-Json
```

**Step 2: Create M365 Account**
```powershell
# Script: Create-M365User
param(
    [string]$UserPrincipalName,
    [string]$SamAccountName,
    [string]$Department
)

# Use Graph API to create M365 user
# ... (Graph API calls here)

# Assign license based on department
$LicenseSkuId = if ($Department -eq "IT") {
    "e43b5b99-8dfb-405f-9987-dc307f34bcbd" # E5 license
} else {
    "6fd2c87f-b296-42f0-b197-1e91e994b900" # E3 license
}

# Assign license via Graph API
# ...

@{
    M365UserId = $newUser.id
    LicenseAssigned = $LicenseSkuId
} | ConvertTo-Json
```

**Step 3: Add to Groups**
```powershell
# Script: Add-ToGroups
param(
    [string]$M365UserId,
    [string]$Department
)

# Add to department-specific M365 groups
# ... (Graph API calls)

@{
    Status = "Complete"
    GroupsAdded = @("All Employees", "Department-$Department")
} | ConvertTo-Json
```

**Workflow Variable Mapping:**
```json
{
  "steps": [
    {
      "order": 1,
      "scriptId": "create-ad-user-script-id"
    },
    {
      "order": 2,
      "scriptId": "create-m365-user-script-id",
      "variableMapping": {
        "UserPrincipalName": "UserPrincipalName",
        "SamAccountName": "SamAccountName",
        "Department": "Department"
      }
    },
    {
      "order": 3,
      "scriptId": "add-to-groups-script-id",
      "variableMapping": {
        "M365UserId": "M365UserId",
        "Department": "Department"
      }
    }
  ]
}
```

## API Reference

### Tenant Admin Endpoints

| Endpoint | Method | Description | Required Role |
|----------|--------|-------------|---------------|
| `/api/tenant-admin/:tenantId/users` | GET | List users in tenant | Tenant Admin or Global Admin |
| `/api/tenant-admin/:tenantId/users` | POST | Add user to tenant | Tenant Admin or Global Admin |
| `/api/tenant-admin/:tenantId/users/:userId` | PATCH | Update user role in tenant | Tenant Admin or Global Admin |
| `/api/tenant-admin/:tenantId/users/:userId` | DELETE | Remove user from tenant | Tenant Admin or Global Admin |
| `/api/tenant-admin/:tenantId/groups` | GET | List groups in tenant | Any user with tenant access |
| `/api/tenant-admin/:tenantId/groups` | POST | Create group | Tenant Admin or Global Admin |
| `/api/tenant-admin/:tenantId/groups/:groupId` | GET | Get group details | Any user with tenant access |
| `/api/tenant-admin/:tenantId/groups/:groupId` | PATCH | Update group | Tenant Admin or Global Admin |
| `/api/tenant-admin/:tenantId/groups/:groupId` | DELETE | Delete group | Tenant Admin or Global Admin |
| `/api/tenant-admin/:tenantId/groups/:groupId/members` | POST | Add member to group | Tenant Admin or Global Admin |
| `/api/tenant-admin/:tenantId/groups/:groupId/members/:userId` | DELETE | Remove member from group | Tenant Admin or Global Admin |

### Script Group Endpoints

| Endpoint | Method | Description | Required Role |
|----------|--------|-------------|---------------|
| `/api/script-groups/assign` | POST | Assign script to group | Tenant Admin or Global Admin |
| `/api/script-groups/unassign` | DELETE | Unassign script from group | Tenant Admin or Global Admin |
| `/api/script-groups/group/:groupId/scripts` | GET | Get scripts for group | Any user with tenant access |
| `/api/script-groups/my-scripts` | GET | Get scripts available to current user | Authenticated user |
| `/api/script-groups/assign-workflow` | POST | Assign workflow to group | Tenant Admin or Global Admin |
| `/api/script-groups/unassign-workflow` | DELETE | Unassign workflow from group | Tenant Admin or Global Admin |

## Best Practices

1. **Least Privilege**: Only grant Tenant Admin role to trusted users
2. **Group Organization**: Create logical groups (IT Support, HR, Developers, etc.)
3. **Script Assignment**: Assign scripts to groups, not individual users
4. **Testing**: Test scripts in a non-production tenant first
5. **Audit Logs**: Regularly review execution logs for security
6. **Credentials**: Use Azure Key Vault for production credential storage
7. **Authentication**: Use app-only auth for automated tasks, delegated for user-specific operations

## Troubleshooting

### User Can't See Scripts

**Check:**
1. Is the user added to the tenant?
2. Is the user a member of a group?
3. Are scripts assigned to that group?
4. Is the script assigned to the correct tenant?

### Tenant Admin Can't Manage Another Tenant

This is expected behavior. Tenant Admins can only manage their assigned tenant. If cross-tenant management is needed, assign the user as Tenant Admin to both tenants, or grant Global Admin role.

### Graph API Authentication Fails

**Check:**
1. Are credentials correctly stored in the database?
2. Does the Azure AD app have required permissions?
3. Has admin consent been granted?
4. Is the client secret valid (not expired)?
5. Is the tenant ID correct (M365 tenant ID, not Univershell tenant ID)?

## Security Considerations

1. **Encryption**: All client secrets are encrypted at rest
2. **Key Management**: Use environment variable `ENCRYPTION_KEY` (32 bytes)
3. **Rotate Secrets**: Regularly rotate Azure AD client secrets
4. **Audit Trail**: All script executions are logged with user, tenant, and timestamp
5. **RBAC**: Multiple levels of access control prevent unauthorized access
6. **Input Validation**: All API inputs are validated with Zod schemas

---

For more information, see the main README.md file.
