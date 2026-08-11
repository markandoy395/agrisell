import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import maplibregl from "maplibre-gl";
import type {
  LngLatLike,
  Map as MapLibreMap,
  Marker as MapLibreMarker,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Icon } from "../../components/ui/icon/Icon";
import "./DeliveriesWorkspace.css";

type DeliveryStatus =
  | "Pending"
  | "Picked Up"
  | "In Transit"
  | "Out for Delivery"
  | "Delivered";

type DeliveryFilter = "All" | "Pending" | "Active" | "Delivered";

type DeliveryTone = "green" | "blue" | "orange" | "neutral";

type DeliveryStepState = "complete" | "current" | "upcoming";

type DeliveryRecord = {
  amount: string;
  assignedStaff: string;
  availability: string;
  availabilityTone: DeliveryTone;
  coldChainStatus: string;
  date: string;
  destination: string;
  destinationAddress: string;
  dispatchNote: string;
  eta: string;
  id: string;
  lastPing: string;
  orderId: string;
  priority: string;
  proofStatus: string;
  receiver: string;
  routeZone: string;
  sender: string;
  senderAddress: string;
  slaStatus: string;
  status: DeliveryStatus;
  statusTone: DeliveryTone;
  vehicle: string;
};

type DeliveryTimelineItem = {
  detail: string;
  label: string;
  time: string;
};

type DeliveryProduct = {
  name: string;
  quantity: string;
  stockStatus: string;
};

type DeliveryRoutePoint = {
  label: string;
  x: number;
  y: number;
};

type DeliveryGeoRoutePoint = {
  kind: "pickup" | "checkpoint" | "current" | "destination";
  label: string;
  lat: number;
  lng: number;
};

type DeliveryGeoCenter = {
  lat: number;
  lng: number;
};

type DeliveryRouteFeature = {
  currentLabel: string;
  currentPoint: DeliveryRoutePoint;
  geoCenter: DeliveryGeoCenter;
  geoHeading: number;
  geoPoints: DeliveryGeoRoutePoint[];
  geoZoom: number;
  points: DeliveryRoutePoint[];
  zoneLabel: string;
};

type DeliveryOperationMetric = {
  detail: string;
  icon: "truck" | "rider" | "trend" | "filter";
  label: string;
  tone: DeliveryTone;
  value: string;
};

type DeliveryProgressStyle = CSSProperties & {
  "--delivery-progress": string;
};

type VectorRoadKind = "local" | "collector" | "arterial" | "highway";

type VectorMapRoad = {
  d: string;
  kind: VectorRoadKind;
  name?: string;
};

type VectorMapLabel = {
  kind: "district" | "road" | "water";
  label: string;
  x: number;
  y: number;
};

type VectorMapPoi = {
  kind: "farm" | "hub" | "market" | "dropoff" | "care";
  label: string;
  x: number;
  y: number;
};

type DeliveryLngLat = [number, number];

type DeliveryRouteGeoJson = {
  features: Array<{
    geometry: {
      coordinates: DeliveryLngLat[];
      type: "LineString";
    };
    properties: {
      kind: "route";
      label: string;
    };
    type: "Feature";
  }>;
  type: "FeatureCollection";
};

type OsrmRoute = {
  geometry?: {
    coordinates?: DeliveryLngLat[];
    type: "LineString";
  };
};

type OsrmRouteResponse = {
  code: string;
  routes?: OsrmRoute[];
};

const DELIVERY_STATUS_ORDER: DeliveryStatus[] = [
  "Pending",
  "Picked Up",
  "In Transit",
  "Out for Delivery",
  "Delivered",
];

const OPENFREEMAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
const OSRM_ROUTE_BASE_URL = "https://router.project-osrm.org/route/v1/driving";
const DELIVERY_ROUTE_SOURCE_ID = "delivery-route-source";
const DELIVERY_ROUTE_CASING_LAYER_ID = "delivery-route-casing";
const DELIVERY_ROUTE_LAYER_ID = "delivery-route-line";
const DELIVERY_BUILDING_LAYER_ID = "delivery-raised-buildings";
const DELIVERY_ROUTE_COLOR = "#2f6f3e";

const routedPathCache = new Map<string, DeliveryLngLat[]>();

const deliveryFilters: DeliveryFilter[] = [
  "All",
  "Pending",
  "Active",
  "Delivered",
];

const deliveryRecords: DeliveryRecord[] = [
  {
    id: "DL-3034",
    orderId: "#AG-1048",
    date: "06/29/2026",
    amount: "PHP 680.00",
    availability: "Available",
    availabilityTone: "green",
    status: "In Transit",
    statusTone: "orange",
    sender: "Green Haven Farm",
    senderAddress: "Lipa City, Batangas",
    receiver: "Maya Dela Cruz",
    destination: "BGC, Taguig",
    destinationAddress: "Tower 2, 26th Street",
    assignedStaff: "Carlo Ramos",
    vehicle: "Motorcycle - BAI 5124",
    eta: "2:35 PM",
    priority: "Fresh produce",
    routeZone: "CALABARZON to BGC",
    slaStatus: "On schedule",
    lastPing: "1 minute ago",
    proofStatus: "Pending customer proof",
    coldChainStatus: "Stable at 8 C",
    dispatchNote: "Keep cold-chain seal intact until buyer handoff.",
  },
  {
    id: "DL-3035",
    orderId: "#AG-1049",
    date: "06/29/2026",
    amount: "PHP 840.00",
    availability: "Available",
    availabilityTone: "green",
    status: "Out for Delivery",
    statusTone: "blue",
    sender: "Mendoza Orchard",
    senderAddress: "Calamba, Laguna",
    receiver: "Ethan Santos",
    destination: "Makati CBD",
    destinationAddress: "Legazpi Village, Makati",
    assignedStaff: "Aira Mendoza",
    vehicle: "Van - NCH 2048",
    eta: "2:10 PM",
    priority: "Same-day",
    routeZone: "Laguna to Makati",
    slaStatus: "Ahead by 8 minutes",
    lastPing: "3 minutes ago",
    proofStatus: "Awaiting delivery photo",
    coldChainStatus: "Ambient produce",
    dispatchNote: "Confirm building loading bay access before arrival.",
  },
  {
    id: "DL-3033",
    orderId: "#AG-1046",
    date: "06/29/2026",
    amount: "PHP 440.00",
    availability: "Cleared",
    availabilityTone: "green",
    status: "Delivered",
    statusTone: "green",
    sender: "San Jose Poultry Farm",
    senderAddress: "San Jose, Batangas",
    receiver: "Lara Villanueva",
    destination: "San Juan",
    destinationAddress: "Wilson Street, San Juan",
    assignedStaff: "Joel Navarro",
    vehicle: "Motorcycle - DKS 9811",
    eta: "Delivered 1:10 PM",
    priority: "Completed",
    routeZone: "Batangas to San Juan",
    slaStatus: "Closed",
    lastPing: "2 hours ago",
    proofStatus: "Photo and signature attached",
    coldChainStatus: "Completed",
    dispatchNote: "Delivery proof is ready for audit.",
  },
  {
    id: "DL-3032",
    orderId: "#AG-1047",
    date: "06/29/2026",
    amount: "PHP 525.00",
    availability: "Awaiting rider",
    availabilityTone: "neutral",
    status: "Pending",
    statusTone: "neutral",
    sender: "Mendoza Orchard",
    senderAddress: "Calamba, Laguna",
    receiver: "Ethan Santos",
    destination: "Quezon City",
    destinationAddress: "Scout Rallos, Quezon City",
    assignedStaff: "Unassigned",
    vehicle: "Not assigned",
    eta: "4:00 PM",
    priority: "Needs assignment",
    routeZone: "Laguna to Quezon City",
    slaStatus: "At risk",
    lastPing: "No rider ping",
    proofStatus: "Not started",
    coldChainStatus: "Awaiting pickup",
    dispatchNote: "Assign available rider before the next dispatch cycle.",
  },
  {
    id: "DL-3036",
    orderId: "#AG-1050",
    date: "06/29/2026",
    amount: "PHP 950.00",
    availability: "Available",
    availabilityTone: "green",
    status: "Picked Up",
    statusTone: "blue",
    sender: "Davao Pineapple Depot",
    senderAddress: "Alabang hub",
    receiver: "Bianca Lopez",
    destination: "Pasig City",
    destinationAddress: "Ortigas Center, Pasig",
    assignedStaff: "Nina Torres",
    vehicle: "Van - PRA 2041",
    eta: "3:25 PM",
    priority: "Bulk order",
    routeZone: "Alabang to Pasig",
    slaStatus: "On schedule",
    lastPing: "5 minutes ago",
    proofStatus: "Pending handoff",
    coldChainStatus: "Stable",
    dispatchNote: "Use van bay at Ortigas receiving dock.",
  },
  {
    id: "DL-3037",
    orderId: "#AG-1051",
    date: "06/29/2026",
    amount: "PHP 360.00",
    availability: "Available",
    availabilityTone: "green",
    status: "Pending",
    statusTone: "neutral",
    sender: "Taal Valley Greens",
    senderAddress: "Taal, Batangas",
    receiver: "Sofia Garcia",
    destination: "Mandaluyong",
    destinationAddress: "Greenfield District",
    assignedStaff: "Awaiting dispatch",
    vehicle: "Not assigned",
    eta: "5:10 PM",
    priority: "Needs assignment",
    routeZone: "Batangas to Mandaluyong",
    slaStatus: "At risk",
    lastPing: "No rider ping",
    proofStatus: "Not started",
    coldChainStatus: "Awaiting pickup",
    dispatchNote: "Coordinate rider after farm pickup confirmation.",
  },
];

const activeDeliveryCount = deliveryRecords.filter((delivery) =>
  ["Picked Up", "In Transit", "Out for Delivery"].includes(delivery.status),
).length;
const unassignedDeliveryCount = deliveryRecords.filter((delivery) =>
  ["Unassigned", "Awaiting dispatch"].includes(delivery.assignedStaff),
).length;
const atRiskDeliveryCount = deliveryRecords.filter(
  (delivery) => delivery.slaStatus === "At risk",
).length;

const deliveryOperationMetrics: DeliveryOperationMetric[] = [
  {
    label: "Active routes",
    value: String(activeDeliveryCount),
    detail: "Moving with assigned staff",
    icon: "truck",
    tone: "green",
  },
  {
    label: "Riders/staff",
    value: String(deliveryRecords.length - unassignedDeliveryCount),
    detail: "Assigned to today's queue",
    icon: "rider",
    tone: "blue",
  },
  {
    label: "At risk",
    value: String(atRiskDeliveryCount),
    detail: "Need dispatch attention",
    icon: "filter",
    tone: "orange",
  },
  {
    label: "SLA status",
    value: "84%",
    detail: "On-time rate today",
    icon: "trend",
    tone: "neutral",
  },
];

const deliveryTimeline: DeliveryTimelineItem[] = [
  {
    label: "Temperature check passed",
    detail: "Cargo stayed within the required produce-safe range.",
    time: "1:49 PM",
  },
  {
    label: "In transit",
    detail: "Rider passed Calamba tollway and is proceeding northbound.",
    time: "1:42 PM",
  },
  {
    label: "Picked up",
    detail: "Shipment scanned and item count confirmed at pickup.",
    time: "1:08 PM",
  },
  {
    label: "Pending",
    detail: "Delivery assignment created after order confirmation.",
    time: "12:18 PM",
  },
];

const deliveryProducts: DeliveryProduct[] = [
  {
    name: "Organic Romaine Lettuce",
    quantity: "8 kg",
    stockStatus: "In stock",
  },
  {
    name: "Fresh Cherry Tomatoes",
    quantity: "5 kg",
    stockStatus: "In stock",
  },
  {
    name: "Basil Bundle",
    quantity: "12 packs",
    stockStatus: "In stock",
  },
];

const statusDescriptions: Record<DeliveryStatus, string> = {
  Pending: "Queued",
  "Picked Up": "Farm pickup confirmed",
  "In Transit": "Moving through route",
  "Out for Delivery": "Near customer area",
  Delivered: "Customer received",
};

const cachedRouteFeatures: Record<string, DeliveryRouteFeature> = {
  "DL-3034": {
    zoneLabel: "CALABARZON to BGC",
    currentLabel: "Calamba tollway",
    currentPoint: { label: "Current", x: 520, y: 236 },
    geoCenter: { lat: 14.5488, lng: 121.0499 },
    geoHeading: 26,
    geoZoom: 15.6,
    geoPoints: [
      { kind: "pickup", label: "Pickup", lat: 14.5418, lng: 121.0532 },
      { kind: "checkpoint", label: "Lipa hub", lat: 14.5456, lng: 121.0514 },
      { kind: "current", label: "Current", lat: 14.5505, lng: 121.0496 },
      { kind: "destination", label: "BGC", lat: 14.5537, lng: 121.0452 },
    ],
    points: [
      { label: "Pickup", x: 625, y: 365 },
      { label: "Lipa hub", x: 566, y: 308 },
      { label: "Current", x: 520, y: 236 },
      { label: "BGC", x: 356, y: 92 },
    ],
  },
  "DL-3035": {
    zoneLabel: "Laguna to Makati",
    currentLabel: "Magallanes interchange",
    currentPoint: { label: "Current", x: 386, y: 132 },
    geoCenter: { lat: 14.5505, lng: 121.0203 },
    geoHeading: 18,
    geoZoom: 15.45,
    geoPoints: [
      { kind: "pickup", label: "Pickup", lat: 14.5356, lng: 121.0203 },
      { kind: "checkpoint", label: "Calamba", lat: 14.5454, lng: 121.019 },
      { kind: "current", label: "Current", lat: 14.5538, lng: 121.0214 },
      { kind: "destination", label: "Makati", lat: 14.5574, lng: 121.0159 },
    ],
    points: [
      { label: "Pickup", x: 606, y: 342 },
      { label: "Calamba", x: 548, y: 268 },
      { label: "Current", x: 386, y: 132 },
      { label: "Makati", x: 318, y: 104 },
    ],
  },
  "DL-3033": {
    zoneLabel: "Batangas to San Juan",
    currentLabel: "Delivered",
    currentPoint: { label: "Delivered", x: 286, y: 104 },
    geoCenter: { lat: 14.595, lng: 121.0372 },
    geoHeading: 32,
    geoZoom: 14.9,
    geoPoints: [
      { kind: "pickup", label: "Pickup", lat: 14.5801, lng: 121.0392 },
      { kind: "checkpoint", label: "SLEX", lat: 14.5886, lng: 121.0371 },
      { kind: "checkpoint", label: "Mandaluyong", lat: 14.594, lng: 121.0356 },
      { kind: "destination", label: "San Juan", lat: 14.6047, lng: 121.0335 },
    ],
    points: [
      { label: "Pickup", x: 640, y: 378 },
      { label: "SLEX", x: 520, y: 228 },
      { label: "Mandaluyong", x: 330, y: 122 },
      { label: "San Juan", x: 286, y: 104 },
    ],
  },
  "DL-3032": {
    zoneLabel: "Laguna to Quezon City",
    currentLabel: "Awaiting rider",
    currentPoint: { label: "Dispatch", x: 588, y: 316 },
    geoCenter: { lat: 14.6368, lng: 121.0434 },
    geoHeading: 6,
    geoZoom: 15.1,
    geoPoints: [
      { kind: "pickup", label: "Farm", lat: 14.6264, lng: 121.0445 },
      { kind: "current", label: "Dispatch", lat: 14.6318, lng: 121.0455 },
      { kind: "checkpoint", label: "North hub", lat: 14.6391, lng: 121.0433 },
      { kind: "destination", label: "Quezon City", lat: 14.6443, lng: 121.0387 },
    ],
    points: [
      { label: "Farm", x: 608, y: 344 },
      { label: "Dispatch", x: 588, y: 316 },
      { label: "North hub", x: 352, y: 92 },
      { label: "Quezon City", x: 236, y: 72 },
    ],
  },
  "DL-3036": {
    zoneLabel: "Alabang to Pasig",
    currentLabel: "Alabang hub",
    currentPoint: { label: "Current", x: 450, y: 212 },
    geoCenter: { lat: 14.5844, lng: 121.061 },
    geoHeading: 42,
    geoZoom: 15.45,
    geoPoints: [
      { kind: "pickup", label: "Depot", lat: 14.5778, lng: 121.0561 },
      { kind: "current", label: "Current", lat: 14.5829, lng: 121.0593 },
      { kind: "checkpoint", label: "Ortigas", lat: 14.5865, lng: 121.0617 },
      { kind: "destination", label: "Pasig", lat: 14.5895, lng: 121.0647 },
    ],
    points: [
      { label: "Depot", x: 476, y: 256 },
      { label: "Current", x: 450, y: 212 },
      { label: "Ortigas", x: 302, y: 118 },
      { label: "Pasig", x: 272, y: 118 },
    ],
  },
  "DL-3037": {
    zoneLabel: "Batangas to Mandaluyong",
    currentLabel: "Awaiting dispatch",
    currentPoint: { label: "Dispatch", x: 620, y: 368 },
    geoCenter: { lat: 14.581, lng: 121.045 },
    geoHeading: 54,
    geoZoom: 15.35,
    geoPoints: [
      { kind: "pickup", label: "Farm", lat: 14.5775, lng: 121.0532 },
      { kind: "current", label: "Dispatch", lat: 14.5793, lng: 121.0494 },
      { kind: "checkpoint", label: "Metro hub", lat: 14.5817, lng: 121.0445 },
      { kind: "destination", label: "Mandaluyong", lat: 14.5834, lng: 121.0369 },
    ],
    points: [
      { label: "Farm", x: 640, y: 386 },
      { label: "Dispatch", x: 620, y: 368 },
      { label: "Metro hub", x: 354, y: 118 },
      { label: "Mandaluyong", x: 318, y: 114 },
    ],
  },
};

const vectorMapParks = [
  "M286 124 C338 88 414 116 434 176 C458 244 396 300 326 282 C254 262 232 164 286 124Z",
  "M526 168 C574 136 650 154 676 204 C704 258 656 314 596 304 C532 294 480 204 526 168Z",
  "M58 278 C106 250 174 270 188 326 C202 386 116 414 58 376 C20 350 22 300 58 278Z",
  "M130 42 C178 20 232 48 232 92 C232 134 172 156 124 126 C86 102 88 62 130 42Z",
];

const vectorRoadFeatures: VectorMapRoad[] = [
  {
    d: "M-20 386 C76 362 148 322 210 264 C278 202 328 178 392 152 C492 112 588 82 742 56",
    kind: "highway",
    name: "SLEX",
  },
  {
    d: "M320 -22 C312 62 328 138 360 212 C394 290 432 342 440 456",
    kind: "highway",
    name: "C-5",
  },
  {
    d: "M-18 184 C76 198 156 188 230 158 C318 122 382 106 466 116 C568 130 632 154 738 124",
    kind: "arterial",
    name: "EDSA",
  },
  {
    d: "M26 70 C112 54 182 76 254 70 C350 62 430 38 526 58 C600 74 654 74 720 40",
    kind: "collector",
  },
  {
    d: "M22 238 C106 238 172 214 240 198 C316 180 384 206 450 196 C540 184 614 214 726 194",
    kind: "collector",
  },
  {
    d: "M44 414 L98 344 L126 258 L214 196 L268 96",
    kind: "collector",
  },
  {
    d: "M584 14 L558 112 L604 196 L550 304 L612 430",
    kind: "collector",
  },
  {
    d: "M60 116 L188 130 L276 116 L410 142 L540 134 L694 92",
    kind: "local",
  },
  {
    d: "M34 156 L140 172 L230 150 L326 174 L458 158 L606 176",
    kind: "local",
  },
  {
    d: "M74 314 L164 294 L244 320 L336 288 L438 316 L534 282 L666 294",
    kind: "local",
  },
  {
    d: "M108 410 L186 352 L276 356 L360 322 L466 374 L564 336 L700 358",
    kind: "local",
  },
  {
    d: "M164 18 L154 102 L184 176 L176 270 L202 414",
    kind: "local",
  },
  {
    d: "M246 20 L242 104 L270 188 L250 286 L290 430",
    kind: "local",
  },
  {
    d: "M476 18 L452 104 L490 176 L466 266 L504 416",
    kind: "local",
  },
  {
    d: "M648 18 L626 112 L666 194 L632 282 L670 416",
    kind: "local",
  },
  {
    d: "M18 354 C84 332 142 352 210 332 C296 306 348 252 430 250 C516 248 580 266 704 230",
    kind: "local",
  },
];

const vectorMapLabels: VectorMapLabel[] = [
  { kind: "district", label: "Quezon City", x: 150, y: 72 },
  { kind: "district", label: "San Juan", x: 260, y: 112 },
  { kind: "district", label: "Makati CBD", x: 326, y: 156 },
  { kind: "district", label: "BGC Taguig", x: 420, y: 106 },
  { kind: "district", label: "Pasig", x: 548, y: 146 },
  { kind: "district", label: "Alabang", x: 502, y: 324 },
  { kind: "water", label: "Laguna de Bay", x: 310, y: 236 },
  { kind: "road", label: "SLEX", x: 520, y: 88 },
  { kind: "road", label: "C-5", x: 386, y: 252 },
  { kind: "road", label: "EDSA", x: 610, y: 142 },
];

const vectorMapPois: VectorMapPoi[] = [
  { kind: "farm", label: "Farm Gate", x: 626, y: 362 },
  { kind: "hub", label: "Lipa Hub", x: 566, y: 308 },
  { kind: "market", label: "BGC Market", x: 356, y: 92 },
  { kind: "dropoff", label: "Receiving Dock", x: 318, y: 104 },
  { kind: "care", label: "Cold Hub", x: 450, y: 212 },
  { kind: "market", label: "Ortigas Center", x: 302, y: 118 },
];

const getProgressPercent = (status: DeliveryStatus) => {
  const currentIndex = DELIVERY_STATUS_ORDER.indexOf(status);
  const maxIndex = DELIVERY_STATUS_ORDER.length - 1;

  return `${Math.max(0, (currentIndex / maxIndex) * 100)}%`;
};

const getStepState = (
  status: DeliveryStatus,
  step: DeliveryStatus,
): DeliveryStepState => {
  const currentIndex = DELIVERY_STATUS_ORDER.indexOf(status);
  const stepIndex = DELIVERY_STATUS_ORDER.indexOf(step);

  if (stepIndex < currentIndex || status === "Delivered") return "complete";
  if (stepIndex === currentIndex) return "current";

  return "upcoming";
};

const matchesDeliveryFilter = (
  delivery: DeliveryRecord,
  filter: DeliveryFilter,
) => {
  if (filter === "All") return true;
  if (filter === "Active") {
    return ["Picked Up", "In Transit", "Out for Delivery"].includes(
      delivery.status,
    );
  }

  return delivery.status === filter;
};

const getRoutePoints = (points: DeliveryRoutePoint[]) =>
  points.map((point) => `${point.x},${point.y}`).join(" ");

const getLngLat = (point: DeliveryGeoRoutePoint): DeliveryLngLat => [
  point.lng,
  point.lat,
];

const getRouteCenter = (route: DeliveryRouteFeature): DeliveryLngLat => [
  route.geoCenter.lng,
  route.geoCenter.lat,
];

const getActiveGeoPoint = (route: DeliveryRouteFeature): DeliveryLngLat => {
  const currentPoint =
    route.geoPoints.find((point) => point.kind === "current") ??
    route.geoPoints[route.geoPoints.length - 1];

  return currentPoint ? getLngLat(currentPoint) : getRouteCenter(route);
};

const getRouteCacheKey = (route: DeliveryRouteFeature) =>
  route.geoPoints.map((point) => `${point.lng},${point.lat}`).join(";");

const createRouteGeoJson = (
  route: DeliveryRouteFeature,
  coordinates = route.geoPoints.map(getLngLat),
): DeliveryRouteGeoJson => ({
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {
        kind: "route",
        label: route.zoneLabel,
      },
      geometry: {
        type: "LineString",
        coordinates,
      },
    },
  ],
});

const fetchRoutedPath = async (
  route: DeliveryRouteFeature,
  signal: AbortSignal,
) => {
  const cacheKey = getRouteCacheKey(route);
  const cachedPath = routedPathCache.get(cacheKey);

  if (cachedPath) return cachedPath;

  const requestUrl = new URL(`${OSRM_ROUTE_BASE_URL}/${cacheKey}`);

  requestUrl.searchParams.set("geometries", "geojson");
  requestUrl.searchParams.set("overview", "full");
  requestUrl.searchParams.set("steps", "false");

  const response = await fetch(requestUrl, { signal });

  if (!response.ok) {
    throw new Error("Route service unavailable.");
  }

  const data = (await response.json()) as OsrmRouteResponse;
  const coordinates = data.routes?.[0]?.geometry?.coordinates;

  if (data.code !== "Ok" || !coordinates?.length) {
    throw new Error("No routed delivery path returned.");
  }

  routedPathCache.set(cacheKey, coordinates);

  return coordinates;
};

const getMapMarkerText = (
  point: DeliveryGeoRoutePoint,
  index: number,
) => {
  if (point.kind === "pickup") return "P";
  if (point.kind === "destination") return "D";
  if (point.kind === "current") return "";

  return String(index + 1);
};

const createMapMarkerElement = (
  point: DeliveryGeoRoutePoint,
  index: number,
) => {
  const markerElement = document.createElement("div");
  const markerDot = document.createElement("span");
  const markerLabel = document.createElement("span");

  markerElement.className = `delivery-map-marker kind-${point.kind}`;
  markerElement.title = point.label;
  markerDot.className = "delivery-map-marker-dot";
  markerDot.textContent = getMapMarkerText(point, index);
  markerLabel.className = "delivery-map-marker-label";
  markerLabel.textContent = point.label;

  markerElement.append(markerDot, markerLabel);

  return markerElement;
};

const renderOpenFreeMapMarkers = ({
  map,
  markers,
  route,
}: {
  map: MapLibreMap;
  markers: MapLibreMarker[];
  route: DeliveryRouteFeature;
}) => {
  markers.forEach((marker) => marker.remove());

  return route.geoPoints.map((point, index) =>
    new maplibregl.Marker({
      anchor: point.kind === "current" ? "center" : "bottom",
      element: createMapMarkerElement(point, index),
      offset: point.kind === "current" ? [0, 0] : [0, -5],
    })
      .setLngLat(getLngLat(point))
      .addTo(map),
  );
};

const addRaisedBuildingLayer = (map: MapLibreMap) => {
  if (
    map.getLayer(DELIVERY_BUILDING_LAYER_ID) ||
    !map.getSource("openmaptiles")
  ) {
    return;
  }

  map.addLayer({
    id: DELIVERY_BUILDING_LAYER_ID,
    minzoom: 15,
    paint: {
      "fill-extrusion-base": [
        "coalesce",
        ["get", "render_min_height"],
        ["get", "min_height"],
        0,
      ],
      "fill-extrusion-color": "#cbc6bc",
      "fill-extrusion-height": [
        "interpolate",
        ["linear"],
        ["zoom"],
        15,
        0,
        15.6,
        ["coalesce", ["get", "render_height"], ["get", "height"], 18],
      ],
      "fill-extrusion-opacity": 0.62,
      "fill-extrusion-vertical-gradient": true,
    },
    source: "openmaptiles",
    "source-layer": "building",
    type: "fill-extrusion",
  });
};

const upsertDeliveryRouteLayer = (
  map: MapLibreMap,
  route: DeliveryRouteFeature,
  coordinates?: DeliveryLngLat[],
) => {
  const routeData = createRouteGeoJson(route, coordinates);
  const existingSource = map.getSource(DELIVERY_ROUTE_SOURCE_ID);

  if (existingSource instanceof maplibregl.GeoJSONSource) {
    existingSource.setData(routeData);
  } else {
    map.addSource(DELIVERY_ROUTE_SOURCE_ID, {
      data: routeData,
      type: "geojson",
    });
  }

  if (!map.getLayer(DELIVERY_ROUTE_CASING_LAYER_ID)) {
    map.addLayer({
      id: DELIVERY_ROUTE_CASING_LAYER_ID,
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": "#fff",
        "line-opacity": 0.96,
        "line-width": 11,
      },
      source: DELIVERY_ROUTE_SOURCE_ID,
      type: "line",
    });
  }

  if (!map.getLayer(DELIVERY_ROUTE_LAYER_ID)) {
    map.addLayer({
      id: DELIVERY_ROUTE_LAYER_ID,
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": DELIVERY_ROUTE_COLOR,
        "line-opacity": 0.95,
        "line-width": 5.5,
      },
      source: DELIVERY_ROUTE_SOURCE_ID,
      type: "line",
    });
  }
};

function DeliveryOpenFreeMap({
  delivery,
  route,
}: {
  delivery: DeliveryRecord;
  route: DeliveryRouteFeature;
}) {
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const initialRouteRef = useRef(route);
  const markersRef = useRef<MapLibreMarker[]>([]);
  const routeRequestIdRef = useRef(0);
  const [isOpenFreeMapReady, setIsOpenFreeMapReady] = useState(false);
  const [shouldUseFallbackMap, setShouldUseFallbackMap] = useState(false);

  useEffect(() => {
    if (!mapElementRef.current || mapRef.current) return;

    const initialRoute = initialRouteRef.current;
    const map = new maplibregl.Map({
      bearing: initialRoute.geoHeading,
      center: getRouteCenter(initialRoute) as LngLatLike,
      container: mapElementRef.current,
      cooperativeGestures: true,
      maxZoom: 19,
      minZoom: 10,
      pitch: 56,
      style: OPENFREEMAP_STYLE_URL,
      zoom: initialRoute.geoZoom,
    });

    map.addControl(
      new maplibregl.NavigationControl({ visualizePitch: true }),
      "top-right",
    );
    mapRef.current = map;

    map.on("load", () => {
      addRaisedBuildingLayer(map);
      upsertDeliveryRouteLayer(map, initialRouteRef.current);
      markersRef.current = renderOpenFreeMapMarkers({
        map,
        markers: markersRef.current,
        route: initialRouteRef.current,
      });
      setIsOpenFreeMapReady(true);
    });

    map.on("error", () => {
      setShouldUseFallbackMap(true);
    });

    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;

    if (!isOpenFreeMapReady || !map) return;

    const abortController = new AbortController();
    const routeRequestId = routeRequestIdRef.current + 1;

    routeRequestIdRef.current = routeRequestId;
    addRaisedBuildingLayer(map);
    upsertDeliveryRouteLayer(map, route);
    map.easeTo({
      bearing: route.geoHeading,
      center: getActiveGeoPoint(route),
      duration: 650,
      essential: true,
      pitch: 56,
      zoom: route.geoZoom,
    });
    markersRef.current = renderOpenFreeMapMarkers({
      map,
      markers: markersRef.current,
      route,
    });

    fetchRoutedPath(route, abortController.signal)
      .then((coordinates) => {
        if (routeRequestIdRef.current !== routeRequestId || !mapRef.current) {
          return;
        }

        upsertDeliveryRouteLayer(mapRef.current, route, coordinates);
      })
      .catch(() => {
        if (!abortController.signal.aborted) {
          upsertDeliveryRouteLayer(map, route);
        }
      });

    return () => {
      abortController.abort();
    };
  }, [delivery.id, isOpenFreeMapReady, route]);

  if (shouldUseFallbackMap) {
    return <DeliveryVectorMap delivery={delivery} route={route} />;
  }

  return (
    <div
      className="delivery-map-canvas delivery-map-canvas-openfreemap"
      aria-label={`${delivery.id} OpenFreeMap route from ${delivery.sender} to ${delivery.destination}`}
      role="region"
    >
      <div className="delivery-openfreemap" ref={mapElementRef} />
      {!isOpenFreeMapReady ? (
        <div className="delivery-map-loading">Loading OpenFreeMap</div>
      ) : null}
      <div className="delivery-map-badge">
        <span>
          <Icon name="rider" size={16} />
        </span>
        <div>
          <strong>{route.currentLabel}</strong>
          <small>OpenFreeMap with routed road path</small>
        </div>
      </div>
      <div className="delivery-map-legend" aria-hidden="true">
        <span>{route.zoneLabel}</span>
        <span>{delivery.lastPing}</span>
      </div>
    </div>
  );
}

function DeliveryVectorMap({
  delivery,
  route,
}: {
  delivery: DeliveryRecord;
  route: DeliveryRouteFeature;
}) {
  return (
    <div
      className="delivery-map-canvas"
      aria-label={`${delivery.id} vector route from ${delivery.sender} to ${delivery.destination}`}
      role="img"
    >
      <svg
        className="delivery-vector-map"
        viewBox="0 0 720 430"
        aria-hidden="true"
      >
        <rect className="delivery-vector-ground" width="720" height="430" rx="0" />
        <path className="delivery-vector-river" d="M278 -28 C244 42 250 104 278 160 C314 232 292 280 266 330 C238 382 244 420 276 458" />
        <path className="delivery-vector-river-branch" d="M288 172 C234 190 192 226 158 276" />
        <path className="delivery-vector-river-branch" d="M288 252 C350 246 396 264 444 306" />
        {vectorMapParks.map((park) => (
          <path className="delivery-vector-park" d={park} key={park} />
        ))}
        <g className="delivery-vector-road-layer">
          {vectorRoadFeatures.map((road) => (
            <g
              className={`delivery-vector-road-group kind-${road.kind}`}
              key={`${road.kind}-${road.name ?? road.d}`}
            >
              <path className="delivery-vector-road-casing" d={road.d} />
              <path className="delivery-vector-road" d={road.d} />
            </g>
          ))}
        </g>
        {vectorMapLabels.map((label) => (
          <text
            className={`delivery-vector-label kind-${label.kind}`}
            key={`${label.kind}-${label.label}`}
            x={label.x}
            y={label.y}
          >
            {label.label}
          </text>
        ))}
        {vectorMapPois.map((poi) => (
          <g
            className={`delivery-vector-poi kind-${poi.kind}`}
            key={`${poi.kind}-${poi.label}`}
          >
            <path d={`M${poi.x} ${poi.y - 15}c-8 0-14 6-14 14 0 9 14 24 14 24s14-15 14-24c0-8-6-14-14-14Z`} />
            <circle cx={poi.x} cy={poi.y - 1} r="5" />
            <text x={poi.x + 16} y={poi.y + 3}>
              {poi.label}
            </text>
          </g>
        ))}
        <polyline className="delivery-vector-route-casing" points={getRoutePoints(route.points)} />
        <polyline className="delivery-vector-route" points={getRoutePoints(route.points)} />
        {route.points.map((point, index) => (
          <g className="delivery-vector-stop" key={`${delivery.id}-${point.label}-${index}`}>
            <circle cx={point.x} cy={point.y} r={index === 0 || index === route.points.length - 1 ? 9 : 7} />
            <text x={point.x} y={point.y - 14}>
              {point.label}
            </text>
          </g>
        ))}
        <g className="delivery-vector-rider">
          <circle cx={route.currentPoint.x} cy={route.currentPoint.y} r="16" />
          <path d={`M${route.currentPoint.x - 7} ${route.currentPoint.y + 3}h14M${route.currentPoint.x - 4} ${route.currentPoint.y + 3}l4-9 5 9`} />
        </g>
      </svg>
      <div className="delivery-map-badge">
        <span>
          <Icon name="rider" size={16} />
        </span>
        <div>
          <strong>{route.currentLabel}</strong>
          <small>Roadmap fallback preview</small>
        </div>
      </div>
      <div className="delivery-map-legend" aria-hidden="true">
        <span>{route.zoneLabel}</span>
        <span>{delivery.lastPing}</span>
      </div>
    </div>
  );
}

export function DeliveriesWorkspace() {
  const [activeFilter, setActiveFilter] = useState<DeliveryFilter>("All");
  const [selectedDeliveryId, setSelectedDeliveryId] = useState(
    deliveryRecords[0].id,
  );

  const visibleDeliveries = useMemo(
    () =>
      deliveryRecords.filter((delivery) =>
        matchesDeliveryFilter(delivery, activeFilter),
      ),
    [activeFilter],
  );
  const selectedDelivery =
    visibleDeliveries.find((delivery) => delivery.id === selectedDeliveryId) ??
    visibleDeliveries[0] ??
    deliveryRecords[0];
  const deliveryProgressStyle: DeliveryProgressStyle = {
    "--delivery-progress": getProgressPercent(selectedDelivery.status),
  };
  const selectedRoute =
    cachedRouteFeatures[selectedDelivery.id] ?? cachedRouteFeatures["DL-3034"];

  return (
    <section className="delivery-workspace" aria-labelledby="delivery-title">
      <div className="delivery-board">
        <header className="delivery-board-header">
          <div>
            <span className="delivery-kicker">LIVE DELIVERY CENTER</span>
            <h2 id="delivery-title">Deliveries</h2>
          </div>

          <div className="delivery-board-actions" aria-label="Delivery tools">
            <button className="delivery-tool-button" type="button">
              <Icon name="calendar" size={16} />
              This month
            </button>
            <button className="delivery-confirm-button" type="button">
              Confirm handoff
            </button>
          </div>
        </header>

        <div className="delivery-ops-summary" aria-label="Delivery operations summary">
          {deliveryOperationMetrics.map((metric) => (
            <article className={`delivery-ops-card tone-${metric.tone}`} key={metric.label}>
              <span className="delivery-ops-icon">
                <Icon name={metric.icon} size={18} />
              </span>
              <div>
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
                <small>{metric.detail}</small>
              </div>
            </article>
          ))}
        </div>

        <div className="delivery-board-shell">
          <aside className="delivery-list-panel" aria-labelledby="delivery-list-title">
            <div className="delivery-list-heading">
              <div>
                <span className="delivery-kicker">ORDERS</span>
                <h3 id="delivery-list-title">Active queue</h3>
              </div>
              <span>{visibleDeliveries.length}</span>
            </div>

            <div className="delivery-filter-tabs" aria-label="Delivery status filters">
              {deliveryFilters.map((filter) => (
                <button
                  className={activeFilter === filter ? "is-active" : ""}
                  key={filter}
                  type="button"
                  onClick={() => setActiveFilter(filter)}
                >
                  {filter}
                </button>
              ))}
            </div>

            <div className="delivery-card-list">
              {visibleDeliveries.map((delivery) => (
                <button
                  className={`delivery-order-card${
                    selectedDelivery.id === delivery.id ? " is-selected" : ""
                  }`}
                  key={delivery.id}
                  type="button"
                  onClick={() => setSelectedDeliveryId(delivery.id)}
                  aria-pressed={selectedDelivery.id === delivery.id}
                >
                  <span className="delivery-card-main">
                    <strong>{delivery.id}</strong>
                    <small>{delivery.date}</small>
                    <b>{delivery.amount}</b>
                    <em>{delivery.priority}</em>
                  </span>
                  <span className="delivery-card-status">
                    <span className={`delivery-availability tone-${delivery.availabilityTone}`}>
                      <i aria-hidden="true" />
                      {delivery.availability}
                    </span>
                    <span className={`delivery-status-pill tone-${delivery.statusTone}`}>
                      {delivery.status}
                    </span>
                    <small>{delivery.slaStatus}</small>
                  </span>
                </button>
              ))}
            </div>
          </aside>

          <div className="delivery-route-panel">
            <DeliveryOpenFreeMap
              delivery={selectedDelivery}
              route={selectedRoute}
            />

            <section className="delivery-tracker" aria-label="Delivery status tracker">
              <div className="delivery-tracker-copy">
                <span className="delivery-kicker">STATUS TRACKER</span>
                <strong>{selectedDelivery.status}</strong>
                <small>ETA {selectedDelivery.eta}</small>
              </div>
              <ol className="delivery-status-steps" style={deliveryProgressStyle}>
                {DELIVERY_STATUS_ORDER.map((status) => {
                  const stepState = getStepState(selectedDelivery.status, status);

                  return (
                    <li
                      className={`delivery-status-step is-${stepState}`}
                      key={status}
                    >
                      <span className="delivery-step-node" aria-hidden="true" />
                      <span>
                        <strong>{status}</strong>
                        <small>{statusDescriptions[status]}</small>
                      </span>
                    </li>
                  );
                })}
              </ol>
            </section>

            <section className="delivery-details-sheet" aria-labelledby="delivery-details-title">
              <div className="delivery-details-header">
                <div>
                  <span className="delivery-kicker">ORDER DETAILS</span>
                  <h3 id="delivery-details-title">{selectedDelivery.orderId}</h3>
                </div>
                <div className="delivery-admin-actions">
                  <span className={`delivery-status-pill tone-${selectedDelivery.statusTone}`}>
                    {selectedDelivery.status}
                  </span>
                  <button type="button">Reassign staff</button>
                  <button type="button">Contact rider</button>
                  <button type="button">Flag issue</button>
                </div>
              </div>

              <div className="delivery-details-grid">
                <div className="delivery-address-column">
                  <dl className="delivery-address-list">
                    <div>
                      <dt>
                        <span className="delivery-address-marker" aria-hidden="true" />
                        From
                      </dt>
                      <dd>
                        <strong>{selectedDelivery.sender}</strong>
                        <span>{selectedDelivery.senderAddress}</span>
                        <time>{selectedDelivery.date} - 1:08 PM</time>
                      </dd>
                    </div>
                    <div>
                      <dt>
                        <span className="delivery-address-marker destination" aria-hidden="true" />
                        Destination
                      </dt>
                      <dd>
                        <strong>{selectedDelivery.receiver}</strong>
                        <span>{selectedDelivery.destinationAddress}</span>
                        <time>{selectedDelivery.date} - ETA {selectedDelivery.eta}</time>
                      </dd>
                    </div>
                    <div>
                      <dt>
                        <span className="delivery-address-marker staff" aria-hidden="true" />
                        Staff
                      </dt>
                      <dd>
                        <strong>{selectedDelivery.assignedStaff}</strong>
                        <span>{selectedDelivery.vehicle}</span>
                      </dd>
                    </div>
                  </dl>
                </div>

                <aside className="delivery-rider-panel" aria-labelledby="delivery-rider-title">
                  <div className="delivery-rider-heading">
                    <span className="delivery-rider-icon">
                      <Icon name="rider" size={22} />
                    </span>
                    <div>
                      <span className="delivery-kicker">RIDER / STAFF</span>
                      <h4 id="delivery-rider-title">{selectedDelivery.assignedStaff}</h4>
                    </div>
                  </div>
                  <dl className="delivery-rider-list">
                    <div>
                      <dt>Vehicle</dt>
                      <dd>{selectedDelivery.vehicle}</dd>
                    </div>
                    <div>
                      <dt>Last GPS ping</dt>
                      <dd>{selectedDelivery.lastPing}</dd>
                    </div>
                    <div>
                      <dt>Route zone</dt>
                      <dd>{selectedDelivery.routeZone}</dd>
                    </div>
                    <div>
                      <dt>SLA</dt>
                      <dd>{selectedDelivery.slaStatus}</dd>
                    </div>
                    <div>
                      <dt>Cold chain</dt>
                      <dd>{selectedDelivery.coldChainStatus}</dd>
                    </div>
                    <div>
                      <dt>Proof</dt>
                      <dd>{selectedDelivery.proofStatus}</dd>
                    </div>
                  </dl>
                  <p>{selectedDelivery.dispatchNote}</p>
                </aside>

                <div className="delivery-product-column">
                  <table className="delivery-product-table">
                    <thead>
                      <tr>
                        <th>Product Name</th>
                        <th>Quantity</th>
                        <th>Stock</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deliveryProducts.map((product) => (
                        <tr key={product.name}>
                          <td>
                            <span className="delivery-product-dot" aria-hidden="true" />
                            {product.name}
                          </td>
                          <td>{product.quantity}</td>
                          <td>{product.stockStatus}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <aside className="delivery-timeline-panel" aria-labelledby="delivery-timeline-title">
                  <span className="delivery-kicker">TIMELINE</span>
                  <h4 id="delivery-timeline-title">Status updates</h4>
                  <ol className="delivery-timeline-list">
                    {deliveryTimeline.map((item, index) => (
                      <li key={`${item.time}-${item.label}`}>
                        <span
                          className={index === 0 ? "is-current" : ""}
                          aria-hidden="true"
                        />
                        <time>{item.time}</time>
                        <div>
                          <strong>{item.label}</strong>
                          <p>{item.detail}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </aside>
              </div>
            </section>
          </div>
        </div>
      </div>
    </section>
  );
}
