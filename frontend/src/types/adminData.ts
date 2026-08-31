import type {
  EntityRecord,
  FarmerFarm,
  OrderRow,
  PaymentRecord,
  UserWorkspaceRow,
} from "./dashboard";

export type CommodityMixItem = {
  color: string;
  name: string;
  orders: number;
};

export type DeliveryStatusItem = {
  color: string;
  dotClass: string;
  label: string;
  value: number;
};

export type SalesTrendPoint = {
  date: string;
  orders: number;
  revenue: number;
};

export type AdminOverviewData = {
  activeFarmers: number;
  activeListings: number;
  commodityMix: CommodityMixItem[];
  deliveryStatuses: DeliveryStatusItem[];
  lowStock: number;
  paymentActivityBars: number[];
  salesTrend: SalesTrendPoint[];
  totalOrders: number;
  totalSales: number;
};

export type AdminDatabaseData = {
  entityRows: Record<string, EntityRecord[]>;
  farmerFarms: FarmerFarm[];
  farmers: EntityRecord[];
  orders: OrderRow[];
  overview: AdminOverviewData;
  payments: PaymentRecord[];
  users: UserWorkspaceRow[];
};
