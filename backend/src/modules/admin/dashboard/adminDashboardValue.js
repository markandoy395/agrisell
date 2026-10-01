// Pure normalization and display formatting for admin dashboard records.
const PHP_FORMATTER = new Intl.NumberFormat('en-PH', {
  currency: 'PHP',
  style: 'currency',
});

const DATE_FORMATTER = new Intl.DateTimeFormat('en-PH', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const isRecord = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asRows = (value) => value.filter(isRecord);

const getText = (value, fallback = '') =>
  typeof value === 'string' && value.trim() ? value.trim() : fallback;

const getNumber = (value, fallback = 0) => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const getTextArray = (value) =>
  Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];

const getId = (value) => {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return '';
};

const createIndex = (rows, field) =>
  rows.reduce((index, row) => {
    const id = getId(row[field]);
    if (id) index.set(id, row);
    return index;
  }, new Map());

const groupRows = (rows, field) =>
  rows.reduce((groups, row) => {
    const id = getId(row[field]);
    if (!id) return groups;
    groups.set(id, [...(groups.get(id) ?? []), row]);
    return groups;
  }, new Map());

const toDisplayText = (value, fallback = 'Not set') => {
  const text = getText(value);
  if (!text) return fallback;
  return text.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
};

const getName = (row, fallback) => {
  const parts = [
    getText(row.first_name),
    getText(row.middle_name),
    getText(row.last_name),
    getText(row.extension_name ?? row.suffix),
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : fallback;
};

const getInitials = (name) =>
  name.split(/\s+/).filter(Boolean).map((part) => part[0]).join('').slice(0, 2)
    .toUpperCase() || 'AG';

const formatMoney = (value) => PHP_FORMATTER.format(getNumber(value));

const formatDate = (value) => {
  const date = new Date(getText(value));
  return Number.isNaN(date.getTime()) ? 'Not recorded' : DATE_FORMATTER.format(date);
};

const formatRelativeTime = (value) => {
  const date = new Date(getText(value));
  if (Number.isNaN(date.getTime())) return 'Not recorded';
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60_000));
  if (elapsedMinutes < 1) return 'Just now';
  if (elapsedMinutes < 60) return `${elapsedMinutes} min${elapsedMinutes === 1 ? '' : 's'} ago`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours} hr${elapsedHours === 1 ? '' : 's'} ago`;
  return formatDate(value);
};

const getTone = (status) => {
  const normalizedStatus = getText(status).toLowerCase();
  if (/(failed|cancelled|canceled|rejected|suspended|inactive|refund|overdue)/.test(normalizedStatus)) return 'red';
  if (/(pending|review|processing|transit|low|awaiting)/.test(normalizedStatus)) return 'orange';
  if (/(active|available|verified|completed|delivered|paid|success|published)/.test(normalizedStatus)) return 'green';
  return 'blue';
};

const toAccountStatus = (value) => {
  const status = getText(value).toLowerCase();
  if (status === 'pending') return 'Pending';
  if (status === 'suspended') return 'Suspended';
  if (status === 'rejected') return 'Rejected';
  if (['deactivated', 'inactive', 'cancelled'].includes(status)) return 'Deactivated';
  return 'Active';
};

const toPaymentStatus = (value) => {
  const status = getText(value).toLowerCase();
  if (/(complete|paid|success|settled)/.test(status)) return 'Completed';
  if (/(fail|cancel|refund|reject)/.test(status)) return 'Failed';
  return 'Pending';
};

const toOrderStatus = (order) =>
  toDisplayText(order.order_status ?? order.payment_status, 'Pending');

module.exports = {
  asRows, createIndex, formatDate, formatMoney, formatRelativeTime, getId,
  getInitials, getName, getNumber, getText, getTextArray, getTone, groupRows,
  toAccountStatus, toDisplayText, toOrderStatus, toPaymentStatus,
};
