import type {
  ChartPoint,
  EntityInfo,
  EntityRecord,
  ModuleHighlight,
  NavigationItem,
  OrderRow,
} from "../types/dashboard";

export const navigation: NavigationItem[] = [
  { label: "Overview", icon: "grid" },
  { label: "Users", icon: "users" },
  { label: "Farmers", icon: "sprout" },
  { label: "Commodities", icon: "basket" },
  { label: "Orders", icon: "cart", count: "18" },
  { label: "Deliveries", icon: "truck" },
  { label: "Payments", icon: "card" },
  { label: "Reviews", icon: "star" },
];

export const orderRows: OrderRow[] = [
  {
    id: "#AG-1048",
    customer: "Maya Dela Cruz",
    initial: "MD",
    item: "Organic Romaine Lettuce",
    qty: "8 kg",
    total: "PHP 680.00",
    status: "To Deliver",
    tone: "blue",
    time: "12 mins ago",
  },
  {
    id: "#AG-1047",
    customer: "Ethan Santos",
    initial: "ES",
    item: "Fresh Cherry Tomatoes",
    qty: "5 kg",
    total: "PHP 525.00",
    status: "Processing",
    tone: "orange",
    time: "27 mins ago",
  },
  {
    id: "#AG-1046",
    customer: "Lara Villanueva",
    initial: "LV",
    item: "Native Free-range Eggs",
    qty: "2 trays",
    total: "PHP 440.00",
    status: "Delivered",
    tone: "green",
    time: "43 mins ago",
  },
  {
    id: "#AG-1045",
    customer: "Noah Reyes",
    initial: "NR",
    item: "Carabao Mangoes",
    qty: "6 kg",
    total: "PHP 720.00",
    status: "Paid",
    tone: "purple",
    time: "1 hr ago",
  },
];

export const commodityRows = [
  { name: "Leafy greens", orders: 324, color: "#9fc98e" },
  { name: "Fruits", orders: 265, color: "#f5b673" },
  { name: "Root crops", orders: 201, color: "#c2a16f" },
  { name: "Poultry & eggs", orders: 164, color: "#b99bcf" },
];

export const chartPoints: ChartPoint[] = [
  {
    date: "Mon, May 26",
    title: "Sales completed",
    events: "96 orders",
    change: "+3.18%",
    left: "2%",
    top: "79%",
  },
  {
    date: "Mon, Jun 2",
    title: "Sales completed",
    events: "112 orders",
    change: "+4.07%",
    left: "25%",
    top: "65%",
  },
  {
    date: "Mon, Jun 9",
    title: "Sales completed",
    events: "118 orders",
    change: "+3.66%",
    left: "50%",
    top: "53%",
  },
  {
    date: "Mon, Jun 16",
    title: "Sales completed",
    events: "121 orders",
    change: "+4.35%",
    left: "75%",
    top: "33%",
  },
  {
    date: "Mon, Jun 23",
    title: "Sales completed",
    events: "128 orders",
    change: "+4.92%",
    left: "98%",
    top: "16%",
  },
];

export const entityInfo: Record<string, EntityInfo> = {
  Users: {
    singular: "user",
    total: "1,842 users",
    description: "Buyers, administrators, and marketplace accounts.",
  },
  Farmers: {
    singular: "farmer",
    total: "86 active farmers",
    description: "Verified farmers and their registered farms.",
  },
  Commodities: {
    singular: "commodity",
    total: "342 active listings",
    description: "Produce available across your farm network.",
  },
  Orders: {
    singular: "order",
    total: "18 open orders",
    description: "Purchases moving through the marketplace.",
  },
  Deliveries: {
    singular: "delivery",
    total: "51 deliveries today",
    description: "Assignments and fulfilment activity.",
  },
  Payments: {
    singular: "payment",
    total: "PHP 186,420 collected",
    description: "Payment records and settlement status.",
  },
  Reviews: {
    singular: "review",
    total: "236 reviews",
    description: "Customer feedback on completed orders.",
  },
};

export const entityRows: Record<string, EntityRecord[]> = {
  Users: [
    {
      primary: "Maya Dela Cruz",
      secondary: "maya.delacruz@email.com",
      category: "Buyer",
      value: "152 loyalty points",
      status: "Active",
      tone: "green",
    },
    {
      primary: "Ramon Garcia",
      secondary: "ramon.garcia@email.com",
      category: "Farmer",
      value: "Member since 2024",
      status: "Active",
      tone: "green",
    },
    {
      primary: "Angela Mendoza",
      secondary: "angela@agrisell.com",
      category: "Administrator",
      value: "Full access",
      status: "Active",
      tone: "green",
    },
  ],
  Farmers: [
    {
      primary: "Green Haven Farm",
      secondary: "Ramon Garcia - Batangas",
      category: "Vegetables",
      value: "14 listings",
      status: "Verified",
      tone: "green",
    },
    {
      primary: "Mendoza Orchard",
      secondary: "Liza Mendoza - Laguna",
      category: "Fruits",
      value: "9 listings",
      status: "Verified",
      tone: "green",
    },
    {
      primary: "Southfield Organics",
      secondary: "Joel Santiago - Quezon",
      category: "Leafy greens",
      value: "6 listings",
      status: "Reviewing",
      tone: "orange",
    },
  ],
  Commodities: [
    {
      primary: "Organic Romaine Lettuce",
      secondary: "Green Haven Farm",
      category: "Leafy greens",
      value: "PHP 85 / kg",
      status: "Available",
      tone: "green",
    },
    {
      primary: "Fresh Cherry Tomatoes",
      secondary: "Mendoza Orchard",
      category: "Fruits",
      value: "PHP 105 / kg",
      status: "Available",
      tone: "green",
    },
    {
      primary: "Carabao Mangoes",
      secondary: "Mendoza Orchard",
      category: "Fruits",
      value: "PHP 120 / kg",
      status: "Low stock",
      tone: "orange",
    },
  ],
  Orders: orderRows.map((row) => ({
    primary: row.id,
    secondary: row.customer,
    category: row.item,
    value: row.total,
    status: row.status,
    tone: row.tone,
  })),
  Deliveries: [
    {
      primary: "DL-3034",
      secondary: "Maya Dela Cruz",
      category: "Pickup: Green Haven Farm",
      value: "Today, 2:30 PM",
      status: "In transit",
      tone: "orange",
    },
    {
      primary: "DL-3033",
      secondary: "Lara Villanueva",
      category: "Rider: Carlo Ramos",
      value: "Today, 1:10 PM",
      status: "Delivered",
      tone: "green",
    },
    {
      primary: "DL-3032",
      secondary: "Ethan Santos",
      category: "Awaiting rider assignment",
      value: "Today, 4:00 PM",
      status: "Pending",
      tone: "blue",
    },
  ],
  Payments: [
    {
      primary: "PY-9812",
      secondary: "Order #AG-1048",
      category: "GCash",
      value: "PHP 680.00",
      status: "Completed",
      tone: "green",
    },
    {
      primary: "PY-9811",
      secondary: "Order #AG-1047",
      category: "Cash on delivery",
      value: "PHP 525.00",
      status: "Pending",
      tone: "orange",
    },
    {
      primary: "PY-9810",
      secondary: "Order #AG-1046",
      category: "Maya wallet",
      value: "PHP 440.00",
      status: "Completed",
      tone: "green",
    },
  ],
  Reviews: [
    {
      primary: "Maya Dela Cruz",
      secondary: "Order #AG-1029",
      category: "Organic Romaine Lettuce",
      value: "5 / 5 rating",
      status: "Published",
      tone: "green",
    },
    {
      primary: "Noah Reyes",
      secondary: "Order #AG-1026",
      category: "Carabao Mangoes",
      value: "4 / 5 rating",
      status: "Published",
      tone: "green",
    },
    {
      primary: "Dana Cruz",
      secondary: "Order #AG-1025",
      category: "Native Free-range Eggs",
      value: "3 / 5 rating",
      status: "Needs reply",
      tone: "orange",
    },
  ],
};

export const moduleHighlights: Record<string, ModuleHighlight[]> = {
  Users: [
    {
      label: "Registered users",
      value: "1,842",
      detail: "Across all account roles",
    },
    {
      label: "New this week",
      value: "64",
      detail: "18% higher than last week",
    },
    { label: "Buyer accounts", value: "1,632", detail: "88.6% of total users" },
  ],
  Farmers: [
    {
      label: "Verified farms",
      value: "86",
      detail: "Ready to sell on Agrisell",
    },
    { label: "Pending review", value: "7", detail: "Require document checks" },
    { label: "New farmers", value: "4", detail: "Joined this week" },
  ],
  Commodities: [
    {
      label: "Live commodities",
      value: "342",
      detail: "Available to marketplace buyers",
    },
    { label: "Low-stock items", value: "42", detail: "Need a quantity update" },
    { label: "Categories", value: "12", detail: "Across produce and poultry" },
  ],
  Orders: [
    {
      label: "Open orders",
      value: "18",
      detail: "Awaiting fulfilment activity",
    },
    { label: "Processing", value: "9", detail: "Being prepared by farmers" },
    { label: "Completed today", value: "34", detail: "Delivered to customers" },
  ],
  Deliveries: [
    {
      label: "On-time rate",
      value: "84%",
      detail: "Of today's active deliveries",
    },
    { label: "In transit", value: "12", detail: "Currently with riders" },
    {
      label: "Need assignment",
      value: "5",
      detail: "Awaiting a delivery partner",
    },
  ],
  Payments: [
    {
      label: "Collected",
      value: "PHP 186k",
      detail: "Settled during this period",
    },
    {
      label: "Pending",
      value: "PHP 8.4k",
      detail: "Awaiting payment confirmation",
    },
    {
      label: "Success rate",
      value: "98.6%",
      detail: "Across payment attempts",
    },
  ],
  Reviews: [
    {
      label: "Average rating",
      value: "4.8",
      detail: "Based on 236 customer reviews",
    },
    {
      label: "Needs reply",
      value: "6",
      detail: "Customer comments to address",
    },
    { label: "Published", value: "228", detail: "Visible on product pages" },
  ],
};
