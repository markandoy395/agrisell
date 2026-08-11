import type { UserDateFilter, UserStatusFilter } from "../../../types/dashboard";
import { Icon } from "../icon/Icon";

type UserControlsProps = {
  dateFilter: UserDateFilter;
  dateFilters: UserDateFilter[];
  hasDownloadableUsers: boolean;
  locationFilter: string;
  locationOptions: string[];
  query: string;
  statusFilter: UserStatusFilter;
  statusOptions: UserStatusFilter[];
  onAdd: () => void;
  onDateFilterChange: (filter: UserDateFilter) => void;
  onDownload: () => void;
  onLocationFilterChange: (location: string) => void;
  onQueryChange: (query: string) => void;
  onStatusFilterChange: (status: UserStatusFilter) => void;
};

export function UserControls({
  dateFilter,
  dateFilters,
  hasDownloadableUsers,
  locationFilter,
  locationOptions,
  query,
  statusFilter,
  statusOptions,
  onAdd,
  onDateFilterChange,
  onDownload,
  onLocationFilterChange,
  onQueryChange,
  onStatusFilterChange,
}: UserControlsProps) {
  return (
    <div className="user-controls">
      <label className="user-search-field">
        <span>Search</span>
        <span>
          <Icon name="search" size={15} />
          <input
            type="search"
            placeholder="Users..."
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </span>
      </label>

      <label className="user-select-field">
        <span>Date joined</span>
        <select
          value={dateFilter}
          onChange={(event) => {
            const selectedFilter = dateFilters.find(
              (filter) => filter === event.target.value,
            );

            if (selectedFilter) onDateFilterChange(selectedFilter);
          }}
        >
          {dateFilters.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      </label>

      <label className="user-select-field">
        <span>Location</span>
        <select
          value={locationFilter}
          onChange={(event) => onLocationFilterChange(event.target.value)}
        >
          {locationOptions.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      </label>

      <label className="user-select-field">
        <span>Status</span>
        <select
          value={statusFilter}
          onChange={(event) => {
            const selectedStatus = statusOptions.find(
              (status) => status === event.target.value,
            );

            if (selectedStatus) onStatusFilterChange(selectedStatus);
          }}
        >
          {statusOptions.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      </label>

      <div className="user-actions">
        <button className="user-add-button" type="button" onClick={onAdd}>
          <Icon name="plus" size={15} />
          Add user
        </button>
        <button
          className="user-download-button"
          type="button"
          disabled={!hasDownloadableUsers}
          onClick={onDownload}
          aria-label="Download filtered users"
        >
          Download
          <Icon name="download" size={16} />
        </button>
      </div>
    </div>
  );
}
