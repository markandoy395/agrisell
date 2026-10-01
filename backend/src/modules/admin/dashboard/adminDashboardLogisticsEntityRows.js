// Maps logistics records into entity-workspace rows.
const {
  createIndex, formatDate, getId, getName, getNumber, getText, getTone, toDisplayText,
} = require('./adminDashboardValue');

const createLogisticsEntityRows = ({ data, farmerFarms }) => {
  const companiesById = createIndex(data.logisticsCompanies, 'logistics_company_id');
  const createRiderRow = (rider) => {
    const company = companiesById.get(getId(rider.logistics_company_id ?? rider.company_id));
    const status = toDisplayText(rider.availability_status ?? rider.employment_status, 'Pending');
    const employmentStatus = toDisplayText(rider.employment_status, 'Pending approval');
    const vehicle = toDisplayText(rider.vehicle_type, 'Vehicle not recorded');
    const deliveries = getNumber(rider.total_deliveries);
    return {
      approvalStatus: employmentStatus === 'Active' ? 'Approved' : employmentStatus,
      approvalTone: getTone(employmentStatus),
      category: company ? getText(company.company_name, 'Logistics company')
        : 'Independent',
      entityId: getId(rider.rider_id),
      primary: getText(rider.full_name, getName(rider, `Rider ${getId(rider.rider_id)}`)),
      secondary: getText(rider.email ?? rider.contact_number, 'Contact not recorded'),
      status, tone: getTone(status),
      value: `${vehicle} · ${deliveries} ${deliveries === 1 ? 'delivery' : 'deliveries'}`,
    };
  };
  return {
    Deliveries: data.deliveries.map((delivery) => {
      const status = toDisplayText(delivery.delivery_status, 'Pending');
      return {
        entityId: getId(delivery.delivery_id),
        category: `Order #AG-${getId(delivery.order_id)}`,
        primary: `Delivery ${getId(delivery.delivery_id)}`,
        secondary: getText(delivery.dropoff_location, 'Drop-off location not set'),
        status, tone: getTone(status), value: `ETA: ${formatDate(delivery.estimated_delivery_time)}`,
      };
    }),
    Farms: farmerFarms.map((farm) => ({
      category: farm.farmingType, entityId: farm.id, gpsLat: farm.gpsLat, gpsLong: farm.gpsLong,
      primary: farm.farmName, secondary: farm.farmLocation, status: farm.status, tone: farm.tone,
      value: `${farm.farmSizeHectares} hectares`,
    })),
    'Logistics Companies': data.riders.map(createRiderRow),
    Riders: data.riders.map(createRiderRow),
  };
};

module.exports = { createLogisticsEntityRows };
