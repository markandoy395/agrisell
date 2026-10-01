// Maps account records into entity-workspace rows.
const {
  formatDate, getId, getName, getNumber, getText, getTone, toAccountStatus, toDisplayText,
} = require('./adminDashboardValue');

const createAccountEntityRows = ({ data, usersById, farmerRows }) => ({
  Admins: data.admins.map((admin) => {
    const userId = getId(admin.user_id);
    const user = usersById.get(userId);
    const status = 'Active';
    return {
      category: toDisplayText(admin.admin_role, 'Administrator'),
      primary: user ? getName(user, `Admin ${userId}`) : `Admin ${userId}`,
      secondary: user ? getText(user.email, 'Email not recorded') : 'User account not recorded',
      status, tone: getTone(status), value: `Assigned ${formatDate(admin.date_assigned)}`,
    };
  }),
  'Admin Roles': data.adminRoles.map((role) => ({
    category: `Level ${getNumber(role.role_level)}`,
    primary: toDisplayText(role.role_name, 'Administrator role'),
    secondary: `Admin user ${getId(role.user_id) || 'Not recorded'}`,
    status: 'Active', tone: 'green', value: getText(role.description, 'No description'),
  })),
  Buyers: data.buyers.map((buyer) => {
    const user = usersById.get(getId(buyer.user_id));
    const status = user ? toAccountStatus(user.account_status) : 'Inactive';
    return {
      category: 'Buyer account',
      primary: user ? getName(user, 'Buyer') : `Buyer ${getId(buyer.buyer_user_id)}`,
      secondary: user ? getText(user.email, 'Email not recorded') : 'User account not recorded',
      status, tone: getTone(status),
      value: `Preferred payment: ${toDisplayText(buyer.preferred_payment_method, 'Not set')}`,
    };
  }),
  Farmers: farmerRows,
  Users: data.users.map((user) => ({
    category: toDisplayText(user.account_role, 'User'),
    primary: getName(user, `User ${getId(user.user_id)}`),
    secondary: getText(user.email, 'Email not recorded'),
    status: toAccountStatus(user.account_status),
    tone: getTone(user.account_status),
    value: `Joined ${formatDate(user.created_at)}`,
  })),
});

module.exports = { createAccountEntityRows };
