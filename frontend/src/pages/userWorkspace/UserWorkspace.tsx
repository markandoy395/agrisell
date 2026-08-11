import { UserControls } from "../../components/ui/userWorkspace/UserControls";
import { UserSummaryGrid } from "../../components/ui/userWorkspace/UserSummaryGrid";
import { UserTable } from "../../components/ui/userWorkspace/UserTable";
import { useUserWorkspace } from "../../hooks/useUserWorkspace";
import { useMemo } from "react";
import type {
  UserWorkspaceRow,
  UserWorkspaceSummaryCard,
} from "../../types/dashboard";
import "./UserWorkspace.css";

type UserWorkspaceProps = {
  onAdd: () => void;
  onOpenUser: (user: UserWorkspaceRow) => void;
  users: UserWorkspaceRow[];
};

const createSummaryCards = (
  users: UserWorkspaceRow[],
): UserWorkspaceSummaryCard[] => {
  const activeUserCount = users.filter(
    (user) => user.accountStatus === "Active",
  ).length;
  const buyerCount = users.filter((user) => user.userType === "Buyer").length;
  const recentUserCount = users.filter((user) => {
    const createdAt = new Date(user.createdAt);

    return (
      !Number.isNaN(createdAt.getTime()) &&
      Date.now() - createdAt.getTime() <= 30 * 24 * 60 * 60 * 1_000
    );
  }).length;

  return [
    {
      detail: "All database accounts",
      icon: "users",
      label: "Total users",
      trend: "Live",
      value: users.length.toLocaleString("en-US"),
    },
    {
      detail: "Registered in the last 30 days",
      icon: "trend",
      label: "New users",
      trend: "Live",
      value: recentUserCount.toLocaleString("en-US"),
    },
    {
      detail: "Accounts currently enabled",
      icon: "settings",
      label: "Active accounts",
      trend: "Live",
      value: activeUserCount.toLocaleString("en-US"),
    },
    {
      detail: "Marketplace customer accounts",
      icon: "card",
      label: "Buyer profiles",
      trend: "Live",
      value: buyerCount.toLocaleString("en-US"),
    },
  ];
};

export function UserWorkspace({
  onAdd,
  onOpenUser,
  users,
}: UserWorkspaceProps) {
  const workspace = useUserWorkspace({ users });
  const summaryCards = useMemo(() => createSummaryCards(users), [users]);

  return (
    <section className="user-workspace" aria-labelledby="users-title">
      <h1 className="user-workspace-title" id="users-title">
        Users
      </h1>

      <UserSummaryGrid cards={summaryCards} />
      <UserControls
        {...workspace.userControls}
        onAdd={onAdd}
        onDateFilterChange={workspace.updateUserDateFilter}
        onDownload={workspace.downloadFilteredUsers}
        onLocationFilterChange={workspace.updateUserLocationFilter}
        onQueryChange={workspace.updateUserQuery}
        onStatusFilterChange={workspace.updateUserStatusFilter}
      />
      <UserTable
        activePage={workspace.activePage}
        allVisibleSelected={workspace.allVisibleUsersSelected}
        firstVisibleUserIndex={workspace.firstVisibleUserIndex}
        lastVisibleUserIndex={workspace.lastVisibleUserIndex}
        pageNumbers={workspace.pageNumbers}
        partiallyVisibleSelected={workspace.partiallyVisibleUsersSelected}
        selectedUserIds={workspace.selectedUserIds}
        totalCount={workspace.filteredUsers.length}
        totalPages={workspace.totalPages}
        users={workspace.pageUsers}
        onOpenUser={onOpenUser}
        onPageChange={workspace.setCurrentPage}
        onToggleAllVisible={workspace.toggleAllVisibleUsers}
        onToggleUserSelection={workspace.toggleUserSelection}
      />
    </section>
  );
}
