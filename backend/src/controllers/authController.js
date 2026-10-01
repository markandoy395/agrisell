const {
  confirmPasswordResetCode,
  requestPasswordResetCode,
} = require('../modules/auth/authPasswordResetController');
const {
  getCurrentSession,
  loginAdmin,
  logoutAdmin,
} = require('../modules/auth/authSessionController');

module.exports = {
  confirmPasswordResetCode,
  getCurrentSession,
  loginAdmin,
  logoutAdmin,
  requestPasswordResetCode,
};
