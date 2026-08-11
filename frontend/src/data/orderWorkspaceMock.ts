import type {
  OrderAvatarTone,
  OrderFilter,
  OrderSummaryCard,
} from "../types/dashboard";

export const orderFilters: OrderFilter[] = [
  "All",
  "Success",
  "Pending",
  "Failed",
];

export const orderPageSize = 12;

export const orderSummaryCards: OrderSummaryCard[] = [
  {
    label: "Total order",
    value: "10.034",
    detail: "vs last month",
    trend: "9%",
    icon: "cart",
    tone: "green",
    trendTone: "green",
  },
  {
    label: "In process",
    value: "4.109",
    detail: "vs last month",
    trend: "8%",
    icon: "truck",
    tone: "blue",
    trendTone: "green",
  },
  {
    label: "Cancelled",
    value: "259",
    detail: "vs last month",
    trend: "2%",
    icon: "close",
    tone: "red",
    trendTone: "red",
  },
  {
    label: "Completed",
    value: "5.666",
    detail: "vs last month",
    trend: "4%",
    icon: "trend",
    tone: "orange",
    trendTone: "green",
  },
];

export const orderDates = [
  "Sep 8, 2025",
  "Sep 7, 2025",
  "Aug 31, 2025",
  "Aug 23, 2025",
  "Aug 22, 2025",
  "Aug 20, 2025",
  "Aug 18, 2025",
  "Aug 16, 2025",
  "Aug 13, 2025",
  "Aug 12, 2025",
  "Aug 11, 2025",
  "Sep 8, 2025",
];

export const orderDestinations = [
  "2900 Ritter Street, Huntley, IL",
  "1790 Oakway Lane, Winston, OR",
  "1406 Matson Street, Denver, CO",
  "3274 Dore Meadow Drive, Riverside, CA",
  "4525 Saints Alley, Plant City, FL",
  "2614 Sweetwood Drive, New York, NY",
  "3522 West Fork Street, Grand Prairie, TX",
  "184 Griffin Street, Gibsonia, PA",
  "105 Jenny Dove Drive, FL",
  "612 Shadowmoor Drive, Wilmington, NC",
  "591 Joanne Lane, Wilmer, AL",
  "467 Stutter Lane, Altoona, PA",
];

export const orderCouriers = [
  "David Elson",
  "Katie Sims",
  "Chris Glosser",
  "James Hall",
  "David Dixon",
  "Corina McCoy",
  "Frances Swan",
  "Daniel Hamill",
  "Paula Mora",
  "Kenneth Allen",
  "Kathy Pacheco",
  "Ricky Smith",
];

export const orderArrivals = [
  "Sep 12, 2025",
  "Sep 10, 2025",
  "Sep 5, 2025",
  "Sep 25, 2025",
  "Sep 26, 2025",
  "Sep 19, 2025",
  "Sep 19, 2025",
  "Sep 14, 2025",
  "Sep 14, 2025",
  "Sep 13, 2025",
  "Sep 12, 2025",
  "Sep 8, 2025",
];

export const orderAvatarTones: OrderAvatarTone[] = [
  "red",
  "blue",
  "purple",
  "green",
  "gold",
];
