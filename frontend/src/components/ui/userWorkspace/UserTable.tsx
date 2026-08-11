import { useEffect, useRef } from "react";
import type { UserWorkspaceRow } from "../../../types/dashboard";
import {
  getUserFullName,
  getUserInitials,
  getUserLocation,
} from "../../../utils/userWorkspace";
import { Icon } from "../icon/Icon";

type UserTableProps = {
  activePage: number;
  allVisibleSelected: boolean;
  firstVisibleUserIndex: number;
  lastVisibleUserIndex: number;
  pageNumbers: number[];
  partiallyVisibleSelected: boolean;
  selectedUserIds: Set<string>;
  totalCount: number;
  totalPages: number;
  users: UserWorkspaceRow[];
  onOpenUser: (user: UserWorkspaceRow) => void;
  onPageChange: (page: number | ((currentPage: number) => number)) => void;
  onToggleAllVisible: () => void;
  onToggleUserSelection: (userId: string) => void;
};

export function UserTable({
  activePage,
  allVisibleSelected,
  firstVisibleUserIndex,
  lastVisibleUserIndex,
  pageNumbers,
  partiallyVisibleSelected,
  selectedUserIds,
  totalCount,
  totalPages,
  users,
  onOpenUser,
  onPageChange,
  onToggleAllVisible,
  onToggleUserSelection,
}: UserTableProps) {
  const selectAllUsersRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (selectAllUsersRef.current) {
      selectAllUsersRef.current.indeterminate = partiallyVisibleSelected;
    }
  }, [partiallyVisibleSelected]);

  return (
    <div className="user-table-panel">
      <div className="user-table-wrap">
        <table className="user-table">
          <colgroup>
            <col className="user-col-select" />
            <col className="user-col-name" />
            <col className="user-col-contact" />
            <col className="user-col-status" />
            <col className="user-col-type" />
            <col className="user-col-location" />
            <col className="user-col-wallet" />
            <col className="user-col-joined" />
            <col className="user-col-actions" />
          </colgroup>
          <thead>
            <tr>
              <th>
                <input
                  ref={selectAllUsersRef}
                  type="checkbox"
                  checked={allVisibleSelected}
                  disabled={users.length === 0}
                  onChange={onToggleAllVisible}
                  aria-label="Select all visible users"
                  aria-checked={
                    partiallyVisibleSelected ? "mixed" : allVisibleSelected
                  }
                />
              </th>
              <th>User and name</th>
              <th>Email and contact</th>
              <th>Account status</th>
              <th>User type</th>
              <th>Shipping address</th>
              <th>Wallet details</th>
              <th>Joined</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.userId}>
                <td>
                  <input
                    type="checkbox"
                    checked={selectedUserIds.has(user.userId)}
                    onChange={() => onToggleUserSelection(user.userId)}
                    aria-label={`Select ${user.userId}`}
                  />
                </td>
                <td>
                  <span className="user-identity">
                    <span className="user-avatar" aria-hidden="true">
                      {getUserInitials(user)}
                    </span>
                    <span>
                      <strong>{getUserFullName(user)}</strong>
                      <small>{user.userId}</small>
                    </span>
                  </span>
                </td>
                <td>
                  <strong>{user.contactNumber}</strong>
                  <small>{user.email}</small>
                </td>
                <td>
                  <span
                    className={`user-status ${user.accountStatus.toLowerCase()}`}
                  >
                    <i aria-hidden="true" />
                    {user.accountStatus}
                  </span>
                </td>
                <td>
                  <strong>{user.userType}</strong>
                  <small>{user.buyerUserId ?? "Primary user profile"}</small>
                </td>
                <td>{getUserLocation(user)}</td>
                <td>
                  <strong>{user.eWalletDetails}</strong>
                  <small>
                    {user.preferredPaymentMethod ?? "No buyer payment method"}
                  </small>
                </td>
                <td>
                  <strong>{user.createdAt}</strong>
                  <small>updated {user.updatedAt}</small>
                </td>
                <td>
                  <button
                    className="user-row-action"
                    type="button"
                    aria-label={`Open ${user.userId}`}
                    onClick={() => onOpenUser(user)}
                  >
                    <Icon name="more" size={18} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {users.length === 0 && (
          <div className="user-empty-state">No matching users found.</div>
        )}
      </div>

      <div className="user-table-footer">
        <span>
          Showing {firstVisibleUserIndex} to {lastVisibleUserIndex} of{" "}
          {totalCount} users
        </span>
        <nav className="user-pagination" aria-label="Users pages">
          <button
            type="button"
            disabled={activePage === 1}
            onClick={() => onPageChange((page) => Math.max(1, page - 1))}
            aria-label="Previous page"
          >
            <Icon name="chevron" size={15} />
          </button>
          {pageNumbers.map((page) => (
            <button
              className={activePage === page ? "is-active" : ""}
              type="button"
              key={page}
              onClick={() => onPageChange(page)}
              aria-current={activePage === page ? "page" : undefined}
            >
              {page}
            </button>
          ))}
          <button
            type="button"
            disabled={activePage === totalPages}
            onClick={() => onPageChange((page) => Math.min(totalPages, page + 1))}
            aria-label="Next page"
          >
            <Icon name="chevron" size={15} />
          </button>
        </nav>
      </div>
    </div>
  );
}
