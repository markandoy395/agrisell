import {
  entityInfo,
  entityRows,
  moduleHighlights,
} from "../data/dashboardMock";
import type { EntityRecord } from "../types/dashboard";
import { Icon } from "../components/ui/Icon";

type EntityWorkspaceProps = {
  section: string;
  search: string;
  created: EntityRecord[];
  activeOnly: boolean;
  onToggleFilter: () => void;
  onAdd: () => void;
  onOpen: (record: EntityRecord) => void;
};

export function EntityWorkspace({
  section,
  search,
  created,
  activeOnly,
  onToggleFilter,
  onAdd,
  onOpen,
}: EntityWorkspaceProps) {
  const info = entityInfo[section];
  const highlights = moduleHighlights[section];
  const records = [...created, ...(entityRows[section] ?? [])].filter(
    (record) => {
      const matchesSearch =
        `${record.primary} ${record.secondary} ${record.category} ${record.status}`
          .toLowerCase()
          .includes(search.toLowerCase().trim());
      return (
        matchesSearch &&
        (!activeOnly ||
          [
            "Active",
            "Available",
            "Verified",
            "Completed",
            "Published",
            "Delivered",
          ].includes(record.status))
      );
    },
  );

  return (
    <section
      className={`management-panel panel module-${section.toLowerCase()}`}
    >
      <div className="management-heading">
        <div>
          <span className="management-count">{info.total}</span>
          <h2>{section} workspace</h2>
          <p>{info.description}</p>
        </div>
        <button className="primary-button" onClick={onAdd}>
          + Add {info.singular}
        </button>
      </div>
      <div className="module-highlights">
        {highlights.map((highlight) => (
          <article key={highlight.label}>
            <span>{highlight.label}</span>
            <strong>{highlight.value}</strong>
            <small>{highlight.detail}</small>
          </article>
        ))}
      </div>
      <div className="management-toolbar">
        <span>{records.length} records shown</span>
        <button
          className={`filter-button ${activeOnly ? "is-active" : ""}`}
          onClick={onToggleFilter}
        >
          {activeOnly ? "Showing active" : "Show active only"}
        </button>
      </div>
      <div className="entity-table-wrap">
        <table>
          <thead>
            <tr>
              <th>RECORD</th>
              <th>TYPE / CATEGORY</th>
              <th>DETAIL</th>
              <th>STATUS</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr key={`${record.primary}-${record.secondary}`}>
                <td>
                  <strong>{record.primary}</strong>
                  <small>{record.secondary}</small>
                </td>
                <td>{record.category}</td>
                <td>{record.value}</td>
                <td>
                  <span className={`status ${record.tone}`}>
                    <i />
                    {record.status}
                  </span>
                </td>
                <td>
                  <button className="row-open" onClick={() => onOpen(record)}>
                    Open <Icon name="arrow" size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {records.length === 0 && (
          <div className="no-orders">No matching records found.</div>
        )}
      </div>
    </section>
  );
}
