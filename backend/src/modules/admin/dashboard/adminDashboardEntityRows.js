// Composes all entity-workspace row groups.
const { createAccountEntityRows } = require('./adminDashboardAccountEntityRows');
const { createCommerceEntityRows } = require('./adminDashboardCommerceEntityRows');
const { createLogisticsEntityRows } = require('./adminDashboardLogisticsEntityRows');
const { createReviewRows } = require('./adminDashboardReviewRows');
const { formatRelativeTime, getId, getText } = require('./adminDashboardValue');

const createEntityRows = ({ data, farmerFarms, farmerRows, usersById }) => {
  const entityRows = {
    ...createAccountEntityRows({ data, farmerRows, usersById }),
    ...createCommerceEntityRows(data),
    ...createLogisticsEntityRows({ data, farmerFarms }),
    Reviews: createReviewRows(data, usersById),
  };
  data.manualRecords.forEach((record) => {
    const section = getText(record.section);
    if (!entityRows[section]) entityRows[section] = [];
    entityRows[section].unshift({
      category: 'Admin-created draft',
      entityId: `manual-${getId(record.record_id)}`,
      primary: getText(record.name, 'Unnamed record'),
      secondary: `Created ${formatRelativeTime(record.created_at)}`,
      status: 'Pending', tone: 'orange', value: 'Details required',
    });
  });
  return entityRows;
};

module.exports = { createEntityRows };
