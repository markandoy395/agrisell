import { Icon } from "../icon/Icon";

type FarmerControlsProps = {
  locationFilter: string;
  locationOptions: string[];
  query: string;
  specialtyFilter: string;
  specialtyOptions: string[];
  statusFilter: string;
  statusOptions: string[];
  onAdd: () => void;
  onDownload: () => void;
  onLocationFilterChange: (location: string) => void;
  onQueryChange: (query: string) => void;
  onSpecialtyFilterChange: (specialty: string) => void;
  onStatusFilterChange: (status: string) => void;
};

export function FarmerControls({
  locationFilter,
  locationOptions,
  query,
  specialtyFilter,
  specialtyOptions,
  statusFilter,
  statusOptions,
  onAdd,
  onDownload,
  onLocationFilterChange,
  onQueryChange,
  onSpecialtyFilterChange,
  onStatusFilterChange,
}: FarmerControlsProps) {
  return (
    <div className="user-controls">
      <label className="user-search-field">
        <span>Search</span>
        <span>
          <Icon name="search" size={15} />
          <input
            type="search"
            placeholder="Farmers..."
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </span>
      </label>

      <label className="user-select-field">
        <span>Specialty</span>
        <select
          value={specialtyFilter}
          onChange={(event) => onSpecialtyFilterChange(event.target.value)}
        >
          {specialtyOptions.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      </label>

      <label className="user-select-field">
        <span>Farm location</span>
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
        <span>Verification</span>
        <select
          value={statusFilter}
          onChange={(event) => onStatusFilterChange(event.target.value)}
        >
          {statusOptions.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      </label>

      <div className="user-actions">
        <button className="user-add-button" type="button" onClick={onAdd}>
          + Add farmer
        </button>
        <button
          className="user-download-button"
          type="button"
          onClick={onDownload}
          aria-label="Download farmers"
        >
          Download
          <Icon name="download" size={16} />
        </button>
      </div>
    </div>
  );
}
