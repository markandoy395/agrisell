import type { AdminDatabaseData, AdministratorRecord } from '../types/adminData'
import { ApiRequestError, requestAdminApi } from './adminAuth'
import {
  parseAdministrator,
  parseEntityRecord,
  parseEntityRows,
  parseFarmerFarm,
  parseUser,
} from './adminEntityParsers'
import { parseOrder, parsePayment } from './adminTransactionParsers'
import { getArray, getNumber, getString, isRecord } from './adminDataValue'

const parseDashboardData = (value: unknown): AdminDatabaseData => {
  if (!isRecord(value) || !isRecord(value.overview)) {
    throw new ApiRequestError('The server returned invalid dashboard data.', 500)
  }
  const overview = value.overview
  return {
    administrators: getArray(value.administrators)
      .map(parseAdministrator)
      .filter((admin): admin is AdministratorRecord => admin !== null),
    entityRows: parseEntityRows(value.entityRows),
    farmerFarms: getArray(value.farmerFarms).map(parseFarmerFarm),
    farmers: getArray(value.farmers).map(parseEntityRecord),
    orders: getArray(value.orders).map(parseOrder),
    overview: {
      activeFarmers: getNumber(overview.activeFarmers),
      activeListings: getNumber(overview.activeListings),
      commodityMix: getArray(overview.commodityMix)
        .filter(isRecord)
        .map((item) => ({
          color: getString(item.color, '#d9dfda'),
          name: getString(item.name, 'Uncategorized'),
          orders: getNumber(item.orders),
        })),
      deliveryStatuses: getArray(overview.deliveryStatuses)
        .filter(isRecord)
        .map((item) => ({
          color: getString(item.color, '#d9dfda'),
          dotClass: getString(item.dotClass, 'dot-gray'),
          label: getString(item.label, 'Pending'),
          value: getNumber(item.value),
        })),
      lowStock: getNumber(overview.lowStock),
      paymentActivityBars: getArray(overview.paymentActivityBars).map((item) => getNumber(item)),
      salesTrend: getArray(overview.salesTrend)
        .filter(isRecord)
        .map((item) => ({
          date: getString(item.date),
          orders: getNumber(item.orders),
          revenue: getNumber(item.revenue),
        })),
      totalOrders: getNumber(overview.totalOrders),
      totalSales: getNumber(overview.totalSales),
    },
    payments: getArray(value.payments).map(parsePayment),
    users: getArray(value.users).map(parseUser),
  }
}

export const getAdminDashboardData = async () =>
  parseDashboardData(await requestAdminApi('/api/admin/dashboard'))
