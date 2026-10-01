import type { EntityRecord } from '../../types/dashboard'
import type { LocationPin, ModuleHighlight } from '../../types/dashboard'
import { Icon } from '../../components/ui/icon/Icon'
import { LocationPinsMap } from '../../components/ui/locationPinsMap/LocationPinsMap'
import { WorkspaceStatsGrid } from '../../components/ui/workspaceStats/WorkspaceStatsGrid'
import type { IconName } from '../../types/icon'
import { getEntityTableColumns } from '../../data/entityWorkspaceConfig'
import { getModuleClassName } from './entityWorkspace.utils'

type EntityTableWorkspaceProps = {
  activeOnly: boolean
  columns: ReturnType<typeof getEntityTableColumns>
  description: string
  highlights: ModuleHighlight[]
  locationPins?: LocationPin[]
  onAdd: () => void
  onOpen: (record: EntityRecord) => void
  onToggleFilter: () => void
  records: EntityRecord[]
  section: string
  singular: string
  total: string
}

const HIGHLIGHT_ICONS: IconName[] = ['trend', 'check', 'calendar', 'alert']

export function EntityTableWorkspace({
  activeOnly,
  columns,
  description,
  highlights,
  locationPins,
  onAdd,
  onOpen,
  onToggleFilter,
  records,
  section,
  singular,
  total,
}: EntityTableWorkspaceProps) {
  return (
    <section className={`management-panel panel ${getModuleClassName(section)}`}>
      <div className="management-heading">
        <div>
          <span className="management-count">{total}</span>
          <h2>{section} workspace</h2>
          <p>{description}</p>
        </div>
        <button className="primary-button" type="button" onClick={onAdd}>
          + Add {singular}
        </button>
      </div>
      <WorkspaceStatsGrid
        ariaLabel={`${section} summary`}
        cards={highlights.map((highlight, index) => ({
          ...highlight,
          icon: HIGHLIGHT_ICONS[index % HIGHLIGHT_ICONS.length],
          trend: 'Live',
        }))}
      />
      {section === 'Farms' && (
        <LocationPinsMap
          title="User and farmer pins"
          description="Agrisell user accounts and registered farmer farms across active service areas."
          pins={locationPins ?? []}
        />
      )}
      <div className="management-toolbar dashboard-filter-grid">
        <span>{records.length} records shown</span>
        <label className="dashboard-filter-field">
          <span>Status</span>
          <select value={activeOnly ? 'active' : 'all'} onChange={onToggleFilter}>
            <option value="all">All records</option>
            <option value="active">Active only</option>
          </select>
        </label>
      </div>
      <div className="entity-table-wrap">
        <table>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.label}>{column.label}</th>
              ))}
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr key={`${record.primary}-${record.secondary}`}>
                {columns.map((column) => {
                  const value = record[column.field]
                  const helper = column.helperField ? record[column.helperField] : null
                  return (
                    <td key={column.label}>
                      {column.isStatus ? (
                        <span className={`status ${record.tone}`}>
                          <i aria-hidden="true" /> {value}
                        </span>
                      ) : helper ? (
                        <>
                          <strong>{value}</strong>
                          <small>{helper}</small>
                        </>
                      ) : (
                        value
                      )}
                    </td>
                  )
                })}
                <td>
                  <button
                    className="icon-action-button"
                    type="button"
                    onClick={() => onOpen(record)}
                    aria-label={`Open ${record.primary}`}
                    title="Open"
                  >
                    <Icon name="eye" size={17} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {records.length === 0 && <div className="no-orders">No matching records found.</div>}
      </div>
    </section>
  )
}
