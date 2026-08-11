const { provisionAdminAccount } = require('../services/supabaseAdminAuthService');

const ADMIN_EMAIL = process.env.BOOTSTRAP_ADMIN_EMAIL ?? 'admin@agrisell.local';
const SUPER_ADMIN_EMAIL =
  process.env.BOOTSTRAP_SUPER_ADMIN_EMAIL ?? 'superadmin@agrisell.local';
const adminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD ?? '';
const superAdminPassword = process.env.BOOTSTRAP_SUPER_ADMIN_PASSWORD ?? '';

const requirePassword = (password, name) => {
  if (password.length < 6) {
    throw new Error(`${name} must be supplied through the process environment.`);
  }
};

const run = async () => {
  requirePassword(adminPassword, 'BOOTSTRAP_ADMIN_PASSWORD');
  requirePassword(superAdminPassword, 'BOOTSTRAP_SUPER_ADMIN_PASSWORD');

  await provisionAdminAccount({
    email: ADMIN_EMAIL,
    password: adminPassword,
    role: 'admin',
  });
  await provisionAdminAccount({
    email: SUPER_ADMIN_EMAIL,
    password: superAdminPassword,
    role: 'super_admin',
  });

  console.log('Agrisell admin accounts were provisioned.');
};

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
