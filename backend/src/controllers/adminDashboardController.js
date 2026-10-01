const {
  approveAdminFarmer,
  approveAdminRider,
  getAdminDashboard,
} = require('./adminDashboardReadController');
const {
  getAdminVerification,
  reviewAdminVerification,
  updateDashboardUser,
  updateDashboardUserStatus,
} = require('./adminLifecycleController');
const { updateAdminProfile } = require('./adminProfileController');
const {
  createAdminReviewResponse,
  moderateAdminReview,
} = require('./adminReviewController');
const {
  createAdminSale,
  deleteAdminSale,
  getAdminSales,
  updateAdminSaleEnabled,
} = require('./adminSaleController');
const {
  createAdministrator,
  createDashboardUser,
  updateAdministratorPrivileges,
} = require('./adminUserController');
const {
  createAdminManualRecord,
  getAdminPreferences,
  requestFarmerInformation,
  saveAdminPreferences,
} = require('./adminWorkspaceController');

module.exports = {
  approveAdminFarmer,
  approveAdminRider,
  createAdminManualRecord,
  createAdminReviewResponse,
  createAdminSale,
  createAdministrator,
  createDashboardUser,
  deleteAdminSale,
  getAdminDashboard,
  getAdminPreferences,
  getAdminSales,
  getAdminVerification,
  moderateAdminReview,
  requestFarmerInformation,
  reviewAdminVerification,
  saveAdminPreferences,
  updateAdminProfile,
  updateAdminSaleEnabled,
  updateAdministratorPrivileges,
  updateDashboardUser,
  updateDashboardUserStatus,
};
