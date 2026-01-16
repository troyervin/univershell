import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create default roles
  const adminRole = await prisma.role.upsert({
    where: { name: 'admin' },
    update: {},
    create: {
      name: 'admin',
      description: 'Full system administrator with all permissions',
      permissions: [
        'manage_users',
        'manage_roles',
        'manage_tenants',
        'manage_scripts',
        'manage_workflows',
        'execute_scripts',
        'view_all_logs',
      ],
    },
  });

  const scriptManagerRole = await prisma.role.upsert({
    where: { name: 'script_manager' },
    update: {},
    create: {
      name: 'script_manager',
      description: 'Can create and manage scripts',
      permissions: ['manage_scripts', 'execute_scripts', 'view_logs'],
    },
  });

  const workflowManagerRole = await prisma.role.upsert({
    where: { name: 'workflow_manager' },
    update: {},
    create: {
      name: 'workflow_manager',
      description: 'Can create and manage workflows',
      permissions: ['manage_workflows', 'execute_scripts', 'view_logs'],
    },
  });

  const operatorRole = await prisma.role.upsert({
    where: { name: 'operator' },
    update: {},
    create: {
      name: 'operator',
      description: 'Can execute scripts and workflows',
      permissions: ['execute_scripts', 'view_logs'],
    },
  });

  const viewerRole = await prisma.role.upsert({
    where: { name: 'viewer' },
    update: {},
    create: {
      name: 'viewer',
      description: 'Read-only access',
      permissions: ['view_logs'],
    },
  });

  console.log('✅ Created roles:', {
    admin: adminRole.id,
    script_manager: scriptManagerRole.id,
    workflow_manager: workflowManagerRole.id,
    operator: operatorRole.id,
    viewer: viewerRole.id,
  });

  // Create default admin user
  const adminPassword = await bcrypt.hash('admin123', 10);
  const adminUser = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      email: 'admin@univershell.local',
      passwordHash: adminPassword,
      firstName: 'System',
      lastName: 'Administrator',
    },
  });

  // Assign admin role to admin user
  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: adminUser.id,
        roleId: adminRole.id,
      },
    },
    update: {},
    create: {
      userId: adminUser.id,
      roleId: adminRole.id,
    },
  });

  console.log('✅ Created admin user:', {
    id: adminUser.id,
    username: adminUser.username,
    email: adminUser.email,
    password: 'admin123 (CHANGE THIS IN PRODUCTION!)',
  });

  // Create example tenants
  const greyOwlTenant = await prisma.tenant.upsert({
    where: { name: 'grey-owl' },
    update: {},
    create: {
      name: 'grey-owl',
      displayName: 'Grey Owl',
      description: 'Grey Owl tenant for AD and M365 management',
      type: 'HYBRID',
      config: {
        domain: 'greyowl.local',
      },
    },
  });

  const onniTenant = await prisma.tenant.upsert({
    where: { name: 'onni' },
    update: {},
    create: {
      name: 'onni',
      displayName: 'Onni',
      description: 'Onni tenant for AD and M365 management',
      type: 'HYBRID',
      config: {
        domain: 'onni.local',
      },
    },
  });

  console.log('✅ Created example tenants:', {
    greyOwl: greyOwlTenant.id,
    onni: onniTenant.id,
  });

  // Grant admin role access to all tenants
  await prisma.tenantAccess.upsert({
    where: {
      roleId_tenantId: {
        roleId: adminRole.id,
        tenantId: greyOwlTenant.id,
      },
    },
    update: {},
    create: {
      roleId: adminRole.id,
      tenantId: greyOwlTenant.id,
    },
  });

  await prisma.tenantAccess.upsert({
    where: {
      roleId_tenantId: {
        roleId: adminRole.id,
        tenantId: onniTenant.id,
      },
    },
    update: {},
    create: {
      roleId: adminRole.id,
      tenantId: onniTenant.id,
    },
  });

  console.log('✅ Granted admin access to all tenants');

  // Create example global script
  const exampleScript = await prisma.script.upsert({
    where: { name_isGlobal: { name: 'get-ps-version', isGlobal: true } },
    update: {},
    create: {
      name: 'get-ps-version',
      displayName: 'Get PowerShell Version',
      description: 'Returns the PowerShell version information',
      code: `# Get PowerShell version
$version = $PSVersionTable | Select-Object PSVersion, PSEdition, Platform, OS
$version | ConvertTo-Json`,
      parameters: [],
      outputs: [
        {
          name: 'PSVersion',
          type: 'string',
          description: 'PowerShell version number',
        },
      ],
      isGlobal: true,
      category: 'System',
      tags: ['diagnostic', 'system'],
      createdBy: adminUser.id,
    },
  });

  console.log('✅ Created example script:', exampleScript.id);

  console.log('');
  console.log('🎉 Database seeding completed successfully!');
  console.log('');
  console.log('📝 Default admin credentials:');
  console.log('   Username: admin');
  console.log('   Password: admin123');
  console.log('');
  console.log('⚠️  IMPORTANT: Change the admin password in production!');
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
