import type {
  UserDateFilter,
  UserStatusFilter,
  UserWorkspaceRow,
} from "../types/dashboard";

type UserFilterParams = {
  allLocationsFilter: string;
  allStatusFilter: string;
  dateFilter: UserDateFilter;
  locationFilter: string;
  query: string;
  statusFilter: UserStatusFilter;
};

export function getUserFullName(user: UserWorkspaceRow) {
  return [
    user.firstName,
    user.middleName,
    user.lastName,
    user.extensionName,
  ]
    .filter(Boolean)
    .join(" ");
}

export function getUserInitials(user: UserWorkspaceRow) {
  return `${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`.toUpperCase();
}

export function getUserLocation(user: UserWorkspaceRow) {
  return user.shippingAddress ?? "No shipping address";
}

export function getUserLocationOptions(
  users: UserWorkspaceRow[],
  allLocationsFilter: string,
) {
  return [
    allLocationsFilter,
    ...Array.from(new Set(users.map(getUserLocation))).sort(),
  ];
}

function matchesUserDateFilter(
  user: UserWorkspaceRow,
  filter: UserDateFilter,
) {
  if (filter === "All") return true;

  const createdAt = new Date(user.createdAt);

  if (Number.isNaN(createdAt.getTime())) return false;

  return Date.now() - createdAt.getTime() <= 30 * 24 * 60 * 60 * 1_000;
}

function getUserSearchText(user: UserWorkspaceRow) {
  return [
    user.userId,
    user.firstName,
    user.middleName,
    user.lastName,
    user.extensionName,
    user.email,
    user.contactNumber,
    user.accountStatus,
    user.gender,
    user.dateOfBirth,
    user.createdAt,
    user.updatedAt,
    user.eWalletDetails,
    user.buyerUserId ?? "",
    getUserLocation(user),
    user.preferredPaymentMethod ?? "",
    user.userType,
    user.businessName ?? "",
  ]
    .join(" ")
    .toLowerCase();
}

export function getFilteredUserRows(
  users: UserWorkspaceRow[],
  {
    allLocationsFilter,
    allStatusFilter,
    dateFilter,
    locationFilter,
    query,
    statusFilter,
  }: UserFilterParams,
) {
  const normalizedQuery = query.toLowerCase().trim();

  return users.filter((user) => {
    const matchesQuery =
      normalizedQuery.length === 0 ||
      getUserSearchText(user).includes(normalizedQuery);
    const matchesLocation =
      locationFilter === allLocationsFilter ||
      getUserLocation(user) === locationFilter;
    const matchesStatus =
      statusFilter === allStatusFilter || user.accountStatus === statusFilter;

    return (
      matchesQuery &&
      matchesUserDateFilter(user, dateFilter) &&
      matchesLocation &&
      matchesStatus
    );
  });
}
