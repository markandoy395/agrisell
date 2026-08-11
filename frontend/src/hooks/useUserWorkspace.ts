import { useMemo, useState } from "react";
import type {
  UserDateFilter,
  UserStatusFilter,
  UserWorkspaceRow,
} from "../types/dashboard";
import { downloadUsersCsv } from "../utils/userCsv";
import {
  getFilteredUserRows,
  getUserLocationOptions,
} from "../utils/userWorkspace";

const allUserLocationsFilter = "All locations";
const allUserStatusFilter = "All status";
const userDateFilters: UserDateFilter[] = ["All", "Recent"];
const userPageSize = 5;
const userStatusFilters: UserStatusFilter[] = [
  allUserStatusFilter,
  "Active",
  "Inactive",
];

type UseUserWorkspaceParams = {
  users: UserWorkspaceRow[];
};

export function useUserWorkspace({ users }: UseUserWorkspaceParams) {
  const [query, setQuery] = useState("");
  const [dateFilter, setDateFilter] = useState<UserDateFilter>("All");
  const [locationFilter, setLocationFilter] = useState(allUserLocationsFilter);
  const [statusFilter, setStatusFilter] =
    useState<UserStatusFilter>(allUserStatusFilter);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [currentPage, setCurrentPage] = useState(1);

  const locationOptions = useMemo(
    () => getUserLocationOptions(users, allUserLocationsFilter),
    [users],
  );

  const filteredUsers = useMemo(
    () =>
      getFilteredUserRows(users, {
        allLocationsFilter: allUserLocationsFilter,
        allStatusFilter: allUserStatusFilter,
        dateFilter,
        locationFilter,
        query,
        statusFilter,
      }),
    [dateFilter, locationFilter, query, statusFilter, users],
  );

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / userPageSize));
  const activePage = Math.min(currentPage, totalPages);
  const pageUsers = filteredUsers.slice(
    (activePage - 1) * userPageSize,
    activePage * userPageSize,
  );
  const visibleUserIds = pageUsers.map((user) => user.userId);
  const selectedVisibleUserCount = visibleUserIds.filter((userId) =>
    selectedUserIds.has(userId),
  ).length;
  const allVisibleUsersSelected =
    visibleUserIds.length > 0 &&
    selectedVisibleUserCount === visibleUserIds.length;
  const partiallyVisibleUsersSelected =
    selectedVisibleUserCount > 0 && !allVisibleUsersSelected;

  const resetUserPage = () => setCurrentPage(1);

  const updateUserQuery = (nextQuery: string) => {
    setQuery(nextQuery);
    resetUserPage();
  };

  const updateUserDateFilter = (filter: UserDateFilter) => {
    setDateFilter(filter);
    resetUserPage();
  };

  const updateUserLocationFilter = (location: string) => {
    setLocationFilter(location);
    resetUserPage();
  };

  const updateUserStatusFilter = (status: UserStatusFilter) => {
    setStatusFilter(status);
    resetUserPage();
  };

  const toggleAllVisibleUsers = () => {
    setSelectedUserIds((current) => {
      const nextSelectedUserIds = new Set(current);

      visibleUserIds.forEach((userId) => {
        if (allVisibleUsersSelected) {
          nextSelectedUserIds.delete(userId);
        } else {
          nextSelectedUserIds.add(userId);
        }
      });

      return nextSelectedUserIds;
    });
  };

  const toggleUserSelection = (userId: string) => {
    setSelectedUserIds((current) => {
      const nextSelectedUserIds = new Set(current);

      if (nextSelectedUserIds.has(userId)) {
        nextSelectedUserIds.delete(userId);
      } else {
        nextSelectedUserIds.add(userId);
      }

      return nextSelectedUserIds;
    });
  };

  const downloadFilteredUsers = () => {
    if (filteredUsers.length === 0) return;

    downloadUsersCsv(filteredUsers);
  };

  return {
    activePage,
    allVisibleUsersSelected,
    downloadFilteredUsers,
    filteredUsers,
    firstVisibleUserIndex:
      (activePage - 1) * userPageSize + (pageUsers.length ? 1 : 0),
    lastVisibleUserIndex: (activePage - 1) * userPageSize + pageUsers.length,
    pageNumbers: Array.from({ length: totalPages }, (_, index) => index + 1),
    pageUsers,
    partiallyVisibleUsersSelected,
    selectedUserIds,
    setCurrentPage,
    totalPages,
    toggleAllVisibleUsers,
    toggleUserSelection,
    userControls: {
      dateFilter,
      dateFilters: userDateFilters,
      hasDownloadableUsers: filteredUsers.length > 0,
      locationFilter,
      locationOptions,
      query,
      statusFilter,
      statusOptions: userStatusFilters,
    },
    updateUserDateFilter,
    updateUserLocationFilter,
    updateUserQuery,
    updateUserStatusFilter,
  };
}
