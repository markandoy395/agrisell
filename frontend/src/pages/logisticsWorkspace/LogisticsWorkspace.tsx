import { useMemo, useState } from "react";
import type { EntityRecord, FarmerSummaryCard } from "../../types/dashboard";
import { FarmerSummaryGrid } from "../../components/ui/farmerWorkspace/FarmerSummaryGrid";
import { Icon } from "../../components/ui/icon/Icon";
import "./LogisticsWorkspace.css";

type LogisticsWorkspaceProps = {
  created: EntityRecord[];
  onAdd: () => void;
  onApproveRider: (rider: EntityRecord) => Promise<void>;
  onOpen: (record: EntityRecord) => void;
  records: EntityRecord[];
  search: string;
};

const RIDERS_PER_PAGE = 10;
const ALL_COMPANIES = "All logistics companies";
const ALL_AVAILABILITY = "All availability";

const getRecordKey = (record: EntityRecord) =>
  record.entityId ?? `${record.primary}-${record.secondary}`;

const getInitials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "RD";

const createSummaryCards = (riders: EntityRecord[]): FarmerSummaryCard[] => {
  const available = riders.filter((rider) => /available/i.test(rider.status));
  const onDelivery = riders.filter((rider) => /on delivery/i.test(rider.status));
  const companies = new Set(
    riders
      .map((rider) => rider.category)
      .filter((company) => company !== "Logistics company not recorded"),
  );

  return [
    {
      detail: "Rider records from the database",
      icon: "rider",
      label: "Registered riders",
      trend: "Live",
      value: riders.length.toLocaleString("en-US"),
    },
    {
      detail: "Available for delivery assignment",
      icon: "trend",
      label: "Available riders",
      trend: "Live",
      value: available.length.toLocaleString("en-US"),
    },
    {
      detail: "Currently handling deliveries",
      icon: "truck",
      label: "On delivery",
      trend: "Live",
      value: onDelivery.length.toLocaleString("en-US"),
    },
    {
      detail: "Companies with assigned riders",
      icon: "users",
      label: "Logistics companies",
      trend: "Live",
      value: companies.size.toLocaleString("en-US"),
    },
  ];
};

const downloadRidersCsv = (riders: EntityRecord[]) => {
  const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const rows = [
    ["Rider", "Contact", "Logistics company", "Vehicle / deliveries", "Availability"],
    ...riders.map((rider) => [
      rider.primary,
      rider.secondary,
      rider.category,
      rider.value,
      rider.status,
    ]),
  ];
  const file = new Blob([rows.map((row) => row.map(escape).join(",")).join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");

  link.href = url;
  link.download = "agrisell-riders.csv";
  link.click();
  URL.revokeObjectURL(url);
};

export function LogisticsWorkspace({
  created,
  onAdd,
  onApproveRider,
  onOpen,
  records,
  search,
}: LogisticsWorkspaceProps) {
  const [query, setQuery] = useState("");
  const [companyFilter, setCompanyFilter] = useState(ALL_COMPANIES);
  const [availabilityFilter, setAvailabilityFilter] = useState(ALL_AVAILABILITY);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [approvingRiderId, setApprovingRiderId] = useState<string | null>(null);
  const allRiders = useMemo(() => [...created, ...records], [created, records]);
  const companies = useMemo(
    () => [
      ALL_COMPANIES,
      ...Array.from(new Set(allRiders.map((rider) => rider.category))).sort(),
    ],
    [allRiders],
  );
  const availabilityOptions = useMemo(
    () => [
      ALL_AVAILABILITY,
      ...Array.from(new Set(allRiders.map((rider) => rider.status))).sort(),
    ],
    [allRiders],
  );
  const filteredRiders = useMemo(() => {
    const terms = `${search} ${query}`.trim().toLowerCase();

    return allRiders.filter((rider) => {
      const matchesQuery =
        !terms ||
        `${rider.primary} ${rider.secondary} ${rider.category} ${rider.value} ${rider.status} ${rider.approvalStatus ?? ""}`
          .toLowerCase()
          .includes(terms);

      return (
        matchesQuery &&
        (companyFilter === ALL_COMPANIES || rider.category === companyFilter) &&
        (availabilityFilter === ALL_AVAILABILITY ||
          rider.status === availabilityFilter)
      );
    });
  }, [allRiders, availabilityFilter, companyFilter, query, search]);
  const totalPages = Math.max(1, Math.ceil(filteredRiders.length / RIDERS_PER_PAGE));
  const activePage = Math.min(currentPage, totalPages);
  const pageRiders = filteredRiders.slice(
    (activePage - 1) * RIDERS_PER_PAGE,
    activePage * RIDERS_PER_PAGE,
  );
  const visibleKeys = pageRiders.map(getRecordKey);
  const allVisibleSelected =
    visibleKeys.length > 0 && visibleKeys.every((key) => selected.has(key));
  const pageNumbers = Array.from({ length: totalPages }, (_, index) => index + 1);
  const resetPage = () => setCurrentPage(1);
  const toggleAllVisible = () => {
    setSelected((current) => {
      const next = new Set(current);
      visibleKeys.forEach((key) => (allVisibleSelected ? next.delete(key) : next.add(key)));
      return next;
    });
  };
  const approveRider = async (rider: EntityRecord) => {
    if (!rider.entityId || rider.approvalStatus === "Approved") return;

    setApprovingRiderId(rider.entityId);
    try {
      await onApproveRider(rider);
    } catch {
      // The page-level handler gives the administrator feedback for failures.
    } finally {
      setApprovingRiderId(null);
    }
  };

  return (
    <section className="user-workspace logistics-workspace" aria-labelledby="logistics-title">
      <h1 className="user-workspace-title" id="logistics-title">Logistics Companies</h1>
      <FarmerSummaryGrid cards={createSummaryCards(allRiders)} />

      <div className="user-controls logistics-controls">
        <label className="user-search-field">
          <span>Search</span>
          <span>
            <Icon name="search" size={15} />
            <input
              type="search"
              placeholder="Riders..."
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                resetPage();
              }}
            />
          </span>
        </label>
        <label className="user-select-field">
          <span>Logistics company</span>
          <select
            value={companyFilter}
            onChange={(event) => {
              setCompanyFilter(event.target.value);
              resetPage();
            }}
          >
            {companies.map((company) => <option key={company}>{company}</option>)}
          </select>
        </label>
        <label className="user-select-field">
          <span>Availability</span>
          <select
            value={availabilityFilter}
            onChange={(event) => {
              setAvailabilityFilter(event.target.value);
              resetPage();
            }}
          >
            {availabilityOptions.map((status) => <option key={status}>{status}</option>)}
          </select>
        </label>
        <div className="user-actions">
          <button className="user-add-button" type="button" onClick={onAdd}>+ Add rider</button>
          <button className="user-download-button" type="button" onClick={() => downloadRidersCsv(filteredRiders)}>
            Download <Icon name="download" size={16} />
          </button>
        </div>
      </div>

      <div className="user-table-panel">
        <div className="user-table-wrap">
          <table className="user-table logistics-table">
            <colgroup>
              <col className="logistics-col-select" />
              <col className="logistics-col-rider" />
              <col className="logistics-col-company" />
              <col className="logistics-col-vehicle" />
              <col className="logistics-col-status" />
              <col className="logistics-col-approval" />
              <col className="logistics-col-actions" />
            </colgroup>
            <thead><tr>
              <th><input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} aria-label="Select all visible riders" /></th>
              <th>rider / contact</th><th>logistics company</th><th>vehicle / deliveries</th><th>availability</th><th>approval</th><th>Actions</th>
            </tr></thead>
            <tbody>{pageRiders.map((rider) => {
              const recordKey = getRecordKey(rider);
              return <tr key={recordKey}>
                <td><input type="checkbox" checked={selected.has(recordKey)} onChange={() => setSelected((current) => {
                  const next = new Set(current);
                  if (next.has(recordKey)) {
                    next.delete(recordKey);
                  } else {
                    next.add(recordKey);
                  }
                  return next;
                })} aria-label={`Select ${rider.primary}`} /></td>
                <td><span className="user-identity"><span className="user-avatar" aria-hidden="true">{getInitials(rider.primary)}</span><span><strong>{rider.primary}</strong><small>{rider.secondary}</small></span></span></td>
                <td><strong>{rider.category}</strong></td>
                <td><strong>{rider.value}</strong></td>
                <td><span className={`user-status ${rider.tone}`}><i aria-hidden="true" />{rider.status}</span></td>
                <td><span className={`user-status ${rider.approvalTone ?? "blue"}`}><i aria-hidden="true" />{rider.approvalStatus ?? "Not recorded"}</span></td>
                <td><div className="logistics-row-actions"><button className="icon-action-button" type="button" disabled={!rider.entityId || rider.approvalStatus === "Approved" || approvingRiderId === rider.entityId} onClick={() => { void approveRider(rider); }} aria-label={rider.approvalStatus === "Approved" ? `${rider.primary} is approved` : approvingRiderId === rider.entityId ? `Approving ${rider.primary}` : `Approve ${rider.primary}`} title={rider.approvalStatus === "Approved" ? "Approved" : approvingRiderId === rider.entityId ? "Approving…" : "Approve"}><Icon name="check" size={17} /></button><button className="user-row-action" type="button" onClick={() => onOpen(rider)} aria-label={`Open ${rider.primary}`}><Icon name="more" size={18} /></button></div></td>
              </tr>;
            })}</tbody>
          </table>
          {pageRiders.length === 0 && <div className="user-empty-state">No matching riders found.</div>}
        </div>
        <div className="user-table-footer">
          <span>Showing {(activePage - 1) * RIDERS_PER_PAGE + (pageRiders.length ? 1 : 0)} to {(activePage - 1) * RIDERS_PER_PAGE + pageRiders.length} of {filteredRiders.length} riders</span>
          <nav className="user-pagination" aria-label="Riders pages">
            <button type="button" disabled={activePage === 1} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} aria-label="Previous page"><Icon name="chevron" size={15} /></button>
            {pageNumbers.map((page) => <button className={activePage === page ? "is-active" : ""} type="button" key={page} onClick={() => setCurrentPage(page)} aria-current={activePage === page ? "page" : undefined}>{page}</button>)}
            <button type="button" disabled={activePage === totalPages} onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} aria-label="Next page"><Icon name="chevron" size={15} /></button>
          </nav>
        </div>
      </div>
    </section>
  );
}
