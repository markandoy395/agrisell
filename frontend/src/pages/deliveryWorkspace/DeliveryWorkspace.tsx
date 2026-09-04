import { useMemo, useState } from "react";
import { UserSummaryGrid } from "../../components/ui/userWorkspace/UserSummaryGrid";
import { Icon } from "../../components/ui/icon/Icon";
import type { EntityRecord, UserWorkspaceSummaryCard } from "../../types/dashboard";
import "./DeliveryWorkspace.css";

type DeliveryWorkspaceProps = {
  created: EntityRecord[];
  records: EntityRecord[];
  search: string;
  onAdd: () => void;
  onOpen: (record: EntityRecord) => void;
};

const DELIVERIES_PER_PAGE = 10;
const ALL_STATUSES = "All statuses";
const ALL_ORDERS = "All orders";

const getDeliveryKey = (delivery: EntityRecord) =>
  delivery.entityId ?? `${delivery.primary}-${delivery.secondary}`;

const isDelivered = (status: string) => /delivered|completed/i.test(status);
const isActive = (status: string) =>
  /to deliver|in transit|on delivery|processing|active/i.test(status);

const createSummaryCards = (
  deliveries: EntityRecord[],
): UserWorkspaceSummaryCard[] => {
  const delivered = deliveries.filter((delivery) => isDelivered(delivery.status));
  const active = deliveries.filter((delivery) => isActive(delivery.status));
  const attention = deliveries.filter(
    (delivery) => !isDelivered(delivery.status) && !isActive(delivery.status),
  );

  return [
    {
      detail: "All database delivery assignments",
      icon: "truck",
      label: "Total deliveries",
      trend: "Live",
      value: deliveries.length.toLocaleString("en-US"),
    },
    {
      detail: "Routes currently being fulfilled",
      icon: "route",
      label: "Active routes",
      trend: "Live",
      value: active.length.toLocaleString("en-US"),
    },
    {
      detail: "Successfully completed deliveries",
      icon: "check",
      label: "Delivered",
      trend: "Live",
      value: delivered.length.toLocaleString("en-US"),
    },
    {
      detail: "Pending or exception records",
      icon: "alert",
      label: "Need attention",
      trend: "Live",
      value: attention.length.toLocaleString("en-US"),
    },
  ];
};

const downloadDeliveriesCsv = (deliveries: EntityRecord[]) => {
  const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const rows = [
    ["Delivery", "Destination", "Order / route", "Schedule", "Status"],
    ...deliveries.map((delivery) => [
      delivery.primary,
      delivery.secondary,
      delivery.category,
      delivery.value,
      delivery.status,
    ]),
  ];
  const file = new Blob(
    [rows.map((row) => row.map(escape).join(",")).join("\n")],
    { type: "text/csv;charset=utf-8" },
  );
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");

  link.href = url;
  link.download = "agrisell-deliveries.csv";
  link.click();
  URL.revokeObjectURL(url);
};

export function DeliveryWorkspace({
  created,
  records,
  search,
  onAdd,
  onOpen,
}: DeliveryWorkspaceProps) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState(ALL_STATUSES);
  const [orderFilter, setOrderFilter] = useState(ALL_ORDERS);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const deliveries = useMemo(() => [...created, ...records], [created, records]);
  const summaryCards = useMemo(() => createSummaryCards(deliveries), [deliveries]);
  const statuses = useMemo(
    () => [ALL_STATUSES, ...Array.from(new Set(deliveries.map((item) => item.status))).sort()],
    [deliveries],
  );
  const orders = useMemo(
    () => [ALL_ORDERS, ...Array.from(new Set(deliveries.map((item) => item.category))).sort()],
    [deliveries],
  );
  const filteredDeliveries = useMemo(() => {
    const terms = `${search} ${query}`.trim().toLowerCase();

    return deliveries.filter((delivery) => {
      const matchesSearch =
        !terms ||
        `${delivery.primary} ${delivery.secondary} ${delivery.category} ${delivery.value} ${delivery.status}`
          .toLowerCase()
          .includes(terms);

      return (
        matchesSearch &&
        (statusFilter === ALL_STATUSES || delivery.status === statusFilter) &&
        (orderFilter === ALL_ORDERS || delivery.category === orderFilter)
      );
    });
  }, [deliveries, orderFilter, query, search, statusFilter]);
  const totalPages = Math.max(
    1,
    Math.ceil(filteredDeliveries.length / DELIVERIES_PER_PAGE),
  );
  const activePage = Math.min(currentPage, totalPages);
  const pageDeliveries = filteredDeliveries.slice(
    (activePage - 1) * DELIVERIES_PER_PAGE,
    activePage * DELIVERIES_PER_PAGE,
  );
  const pageNumbers = Array.from({ length: totalPages }, (_, index) => index + 1);
  const visibleKeys = pageDeliveries.map(getDeliveryKey);
  const allVisibleSelected =
    visibleKeys.length > 0 && visibleKeys.every((key) => selected.has(key));
  const resetPage = () => setCurrentPage(1);
  const toggleAllVisible = () => {
    setSelected((current) => {
      const next = new Set(current);

      visibleKeys.forEach((key) =>
        allVisibleSelected ? next.delete(key) : next.add(key),
      );
      return next;
    });
  };
  const toggleDelivery = (key: string) => {
    setSelected((current) => {
      const next = new Set(current);

      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  return (
    <section className="user-workspace delivery-workspace" aria-labelledby="deliveries-title">
      <h1 className="user-workspace-title" id="deliveries-title">Deliveries</h1>

      <UserSummaryGrid cards={summaryCards} ariaLabel="Deliveries summary" />

      <div className="user-controls delivery-controls">
        <label className="user-search-field">
          <span>Search</span>
          <span>
            <Icon name="search" size={15} />
            <input
              type="search"
              placeholder="Deliveries..."
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                resetPage();
              }}
            />
          </span>
        </label>
        <label className="user-select-field">
          <span>Order / route</span>
          <select value={orderFilter} onChange={(event) => { setOrderFilter(event.target.value); resetPage(); }}>
            {orders.map((option) => <option key={option}>{option}</option>)}
          </select>
        </label>
        <label className="user-select-field">
          <span>Status</span>
          <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); resetPage(); }}>
            {statuses.map((option) => <option key={option}>{option}</option>)}
          </select>
        </label>
        <div className="user-actions">
          <button className="user-add-button" type="button" onClick={onAdd}>
            <Icon name="plus" size={15} /> Add delivery
          </button>
          <button className="user-download-button" type="button" disabled={!filteredDeliveries.length} onClick={() => downloadDeliveriesCsv(filteredDeliveries)}>
            Download <Icon name="download" size={16} />
          </button>
        </div>
      </div>

      <div className="user-table-panel">
        <div className="user-table-wrap">
          <table className="user-table delivery-table">
            <colgroup>
              <col className="delivery-col-select" />
              <col className="delivery-col-id" />
              <col className="delivery-col-order" />
              <col className="delivery-col-schedule" />
              <col className="delivery-col-status" />
              <col className="delivery-col-action" />
            </colgroup>
            <thead><tr>
              <th><input type="checkbox" checked={allVisibleSelected} disabled={!pageDeliveries.length} onChange={toggleAllVisible} aria-label="Select all visible deliveries" /></th>
              <th>Delivery and destination</th>
              <th>Order / route</th>
              <th>Schedule</th>
              <th>Status</th>
              <th>Actions</th>
            </tr></thead>
            <tbody>
              {pageDeliveries.map((delivery) => {
                const key = getDeliveryKey(delivery);

                return <tr key={key}>
                  <td><input type="checkbox" checked={selected.has(key)} onChange={() => toggleDelivery(key)} aria-label={`Select ${delivery.primary}`} /></td>
                  <td><span className="user-identity"><span className="user-avatar delivery-avatar" aria-hidden="true"><Icon name="truck" size={15} /></span><span><strong>{delivery.primary}</strong><small>{delivery.secondary}</small></span></span></td>
                  <td><strong>{delivery.category}</strong><small>Assigned delivery route</small></td>
                  <td><strong>{delivery.value}</strong><small>Estimated arrival</small></td>
                  <td><span className={`user-status ${delivery.tone}`}><i aria-hidden="true" />{delivery.status}</span></td>
                  <td><button className="user-row-action" type="button" onClick={() => onOpen(delivery)} aria-label={`Open ${delivery.primary}`} title="Open delivery"><Icon name="more" size={18} /></button></td>
                </tr>;
              })}
            </tbody>
          </table>
          {!pageDeliveries.length && <div className="user-empty-state">No matching deliveries found.</div>}
        </div>

        <div className="user-table-footer">
          <span>Showing {(activePage - 1) * DELIVERIES_PER_PAGE + (pageDeliveries.length ? 1 : 0)} to {(activePage - 1) * DELIVERIES_PER_PAGE + pageDeliveries.length} of {filteredDeliveries.length} deliveries</span>
          <nav className="user-pagination" aria-label="Delivery pages">
            <button type="button" disabled={activePage === 1} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} aria-label="Previous page"><Icon name="chevron" size={15} /></button>
            {pageNumbers.map((page) => <button className={activePage === page ? "is-active" : ""} type="button" key={page} onClick={() => setCurrentPage(page)} aria-current={activePage === page ? "page" : undefined}>{page}</button>)}
            <button type="button" disabled={activePage === totalPages} onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} aria-label="Next page"><Icon name="chevron" size={15} /></button>
          </nav>
        </div>
      </div>
    </section>
  );
}
