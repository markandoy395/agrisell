import type { EntityRecord, FarmerFarmLookup } from "../../../types/dashboard";
import {
  farmerPageSize,
  getFarmerCommoditySummary,
  getFarmerHectareSummary,
  getFarmerInitials,
  getFarmerLocationSummary,
  getFarmerRecordKey,
} from "../../../utils/farmerWorkspace";
import { Icon } from "../icon/Icon";
import "./FarmerTable.css";

type FarmerTableProps = {
  activePage: number;
  allVisibleSelected: boolean;
  farmerFarmLookup: FarmerFarmLookup;
  farmers: EntityRecord[];
  pageNumbers: number[];
  selectedFarmerRecordKeys: Set<string>;
  totalCount: number;
  totalPages: number;
  onApproveFarmer: (farmer: EntityRecord) => Promise<void>;
  onOpenFarmer: (farmer: EntityRecord) => void;
  onPageChange: (page: number | ((currentPage: number) => number)) => void;
  onToggleAllVisible: () => void;
  onToggleFarmerSelection: (recordKey: string) => void;
};

export function FarmerTable({
  activePage,
  allVisibleSelected,
  farmerFarmLookup,
  farmers,
  pageNumbers,
  selectedFarmerRecordKeys,
  totalCount,
  totalPages,
  onApproveFarmer,
  onOpenFarmer,
  onPageChange,
  onToggleAllVisible,
  onToggleFarmerSelection,
}: FarmerTableProps) {
  return (
    <div className="user-table-panel">
      <div className="user-table-wrap">
        <table className="user-table farmer-table">
          <colgroup>
            <col className="farmer-col-select" />
            <col className="farmer-col-name" />
            <col className="farmer-col-specialty" />
            <col className="farmer-col-farms" />
            <col className="farmer-col-location" />
            <col className="farmer-col-commodities" />
            <col className="farmer-col-status" />
            <col className="farmer-col-actions" />
          </colgroup>
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={onToggleAllVisible}
                  aria-label="Select all visible farmers"
                />
              </th>
              <th>farmer_user_id / name</th>
              <th>specialty</th>
              <th>registered_farms</th>
              <th>farm_locations</th>
              <th>commodities</th>
              <th>verification</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {farmers.map((farmer) => {
              const recordKey = getFarmerRecordKey(farmer);
              const farms = farmer.entityId
                ? (farmerFarmLookup[farmer.entityId] ?? [])
                : [];

              return (
                <tr key={recordKey}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedFarmerRecordKeys.has(recordKey)}
                      onChange={() => onToggleFarmerSelection(recordKey)}
                      aria-label={`Select ${farmer.primary}`}
                    />
                  </td>
                  <td>
                    <span className="user-identity">
                      <span className="user-avatar" aria-hidden="true">
                        {getFarmerInitials(farmer)}
                      </span>
                      <span>
                        <strong>{farmer.primary}</strong>
                        <small>{farmer.entityId ?? farmer.secondary}</small>
                      </span>
                    </span>
                  </td>
                  <td>
                    <strong>{farmer.category}</strong>
                    <small>{farmer.secondary}</small>
                  </td>
                  <td>
                    <strong>{farmer.value}</strong>
                    <small>{getFarmerHectareSummary(farms)}</small>
                  </td>
                  <td>
                    <strong>{getFarmerLocationSummary(farms)}</strong>
                    <small>
                      {farms[0]?.farmName ?? "No registered farm profile"}
                    </small>
                  </td>
                  <td>
                    <strong>{getFarmerCommoditySummary(farms)}</strong>
                    <small>{farms.length} farm profiles</small>
                  </td>
                  <td>
                    <span className={`user-status ${farmer.tone}`}>
                      <i aria-hidden="true" />
                      {farmer.status}
                    </span>
                  </td>
                  <td>
                    <div className="farmer-row-actions">
                      <button
                        className="farmer-row-approve"
                        type="button"
                        disabled={farmer.status === "Verified" || !farmer.entityId}
                        onClick={() => {
                          void onApproveFarmer(farmer).catch(() => undefined);
                        }}
                      >
                        {farmer.status === "Verified" ? "Approved" : "Approve"}
                      </button>
                      <button
                        className="user-row-action"
                        type="button"
                        aria-label={
                          farmer.entityId
                            ? `View farms for ${farmer.primary}`
                            : `Open ${farmer.primary}`
                        }
                        onClick={() => onOpenFarmer(farmer)}
                      >
                        <Icon name="more" size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {farmers.length === 0 && (
          <div className="user-empty-state">No matching farmers found.</div>
        )}
      </div>

      <div className="user-table-footer">
        <span>
          Showing {(activePage - 1) * farmerPageSize + (farmers.length ? 1 : 0)}{" "}
          to {(activePage - 1) * farmerPageSize + farmers.length} of{" "}
          {totalCount} farmers
        </span>
        <nav className="user-pagination" aria-label="Farmers pages">
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
