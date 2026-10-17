import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { EntityRecord } from '../../types/dashboard'
import { Icon } from '../../components/ui/icon/Icon'
import {
  createLogisticsSummaryCards,
  downloadRidersCsv,
  getRiderInitials,
  getRiderRecordKey,
  ridersPerPage,
} from './logisticsWorkspace.utils'
import { useLogisticsWorkspace } from './useLogisticsWorkspace'
import { RiderProfileModal } from './RiderProfileModal'
import { EditRiderModal } from './EditRiderModal'
import { ApproveRiderModal } from './ApproveRiderModal'
import { RejectRiderModal } from './RejectRiderModal'
import { AssignDeliveryToRiderModal } from './AssignDeliveryToRiderModal'
import './LogisticsWorkspace.css'

type LogisticsWorkspaceProps = {
  created: EntityRecord[]
  onAdd: () => void
  onApproveRider: (rider: EntityRecord, message: string) => Promise<void>
  onOpen: (record: EntityRecord) => void
  records: EntityRecord[]
  search: string
  onRiderSaved?: () => Promise<void>
  onDeliveryAssigned?: (rider: EntityRecord, orderId: number) => Promise<void>
  onRejectRider: (rider: EntityRecord, reason: string) => Promise<void>
  onDeleteRider?: (rider: EntityRecord) => void
}

const getAvailabilityClass = (status: string) => {
  const s = status.toLowerCase()
  if (s.includes('offline')) return 'is-offline'
  if (s.includes('online') || s.includes('available')) return 'is-available'
  if (s.includes('busy') || s.includes('delivery')) return 'is-ondelivery'
  return 'is-offline'
}

const getApprovalClass = (approval: string | undefined) => {
  const a = (approval ?? '').toLowerCase()
  if (a.includes('approved') || a.includes('active')) return 'is-approved'
  if (a.includes('pending')) return 'is-pending'
  if (a.includes('rejected') || a.includes('suspend')) return 'is-rejected'
  return 'is-approved'
}

export function LogisticsWorkspace({
  created,
  onAdd,
  onApproveRider,
  onOpen,
  records,
  search,
  onRiderSaved,
  onDeliveryAssigned,
  onRejectRider,
  onDeleteRider,
}: LogisticsWorkspaceProps) {
  const [profileRider, setProfileRider] = useState<EntityRecord | null>(null)
  const [editRider, setEditRider] = useState<EntityRecord | null>(null)
  const [approvalRider, setApprovalRider] = useState<EntityRecord | null>(null)
  const [rejectionRider, setRejectionRider] = useState<EntityRecord | null>(null)
  const [assignmentRider, setAssignmentRider] = useState<EntityRecord | null>(null)
  const workspace = useLogisticsWorkspace({
    created,
    records,
    search,
  })

  const {
    activePage,
    allVisibleSelected,
    availabilityFilter,
    availabilityOptions,
    closeMenu,
    companies,
    companyFilter,
    deleteRiderRecord,
    filteredRiders,
    menuPosition,
    openMenuKey,
    pageNumbers,
    pageRiders,
    query,
    selected,
    setSubmenuOpen,
    submenuOpen,
    toggleMenu,
    totalPages,
    setCurrentPage,
    toggleAllVisible,
    toggleRiderSelection,
    updateAvailabilityFilter,
    updateCompanyFilter,
    updateQuery,
    updateRiderStatus,
  } = workspace

  const summaryCards = createLogisticsSummaryCards(workspace.allRiders)

  useEffect(() => {
    if (!openMenuKey) return

    const handleDocumentClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      if (!target) return
      if (target.closest('.riders-menu-trigger') || target.closest('.riders-dropdown-menu')) {
        return
      }
      closeMenu()
    }

    const handleScroll = (event: Event) => {
      const target = event.target as HTMLElement | null
      if (target?.closest?.('.riders-dropdown-menu')) return
      closeMenu()
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMenu()
      }
    }

    document.addEventListener('mousedown', handleDocumentClick)
    window.addEventListener('scroll', handleScroll, true)
    window.addEventListener('resize', closeMenu)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handleDocumentClick)
      window.removeEventListener('scroll', handleScroll, true)
      window.removeEventListener('resize', closeMenu)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [openMenuKey, closeMenu])

  return (
    <section className="riders-workspace" aria-labelledby="riders-title">
      <h1 className="riders-visually-hidden" id="riders-title">
        Riders
      </h1>

      {/* Summary Cards */}
      <div className="riders-stats-grid" aria-label="Riders summary statistics">
        {summaryCards.map((card) => (
          <div key={card.key} className={`riders-stat-card riders-stat-card--${card.key}`}>
            <div className="riders-stat-top">
              <div
                className={`riders-stat-icon-wrap ${card.solidIcon ? 'is-solid' : ''}`}
                aria-hidden="true"
              >
                <Icon name={card.icon} size={16} />
              </div>
              <span className="riders-stat-label">{card.label}</span>
              <button
                type="button"
                className="riders-stat-more"
                aria-label={`Options for ${card.label}`}
              >
                <Icon name="more" size={16} />
              </button>
            </div>
            <div className="riders-stat-mid">
              <span className="riders-stat-value">{card.value}</span>
              <span className="riders-stat-live-badge">
                Live
                <Icon name="trend" size={12} />
              </span>
            </div>
            <div className="riders-stat-bottom">
              <span className="riders-stat-detail">{card.detail}</span>
            </div>
            <div
              className="riders-stat-accent-bar"
              style={{ backgroundColor: card.accentColor }}
              aria-hidden="true"
            />
          </div>
        ))}
      </div>

      {/* Search and Filters Toolbar */}
      <div className="riders-controls-bar dashboard-filter-grid">
        <div className="riders-controls-left">
          <label className="riders-search-wrap dashboard-filter-field">
            <span>Search</span>
            <span className="dashboard-filter-control">
              <Icon name="search" size={16} />
              <input
                type="search"
                className="riders-search-input"
                placeholder="Riders..."
                value={query}
                onChange={(event) => updateQuery(event.target.value)}
              />
            </span>
          </label>

          <label className="riders-select-wrap dashboard-filter-field">
            <span>Company</span>
            <select
              className="riders-select"
              value={companyFilter}
              onChange={(event) => updateCompanyFilter(event.target.value)}
              aria-label="Filter by affiliation"
            >
              {companies.map((company) => (
                <option key={company} value={company}>
                  {company}
                </option>
              ))}
            </select>
          </label>

          <label className="riders-select-wrap dashboard-filter-field">
            <span>Availability</span>
            <select
              className="riders-select"
              value={availabilityFilter}
              onChange={(event) => updateAvailabilityFilter(event.target.value)}
              aria-label="Filter by availability"
            >
              {availabilityOptions.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="riders-controls-right dashboard-filter-actions">
          <button className="riders-action-btn" type="button" onClick={onAdd}>
            <Icon name="plus" size={15} />
            Add rider
          </button>
          <button
            className="riders-action-btn is-secondary"
            type="button"
            onClick={() => downloadRidersCsv(filteredRiders)}
          >
            <Icon name="download" size={15} />
            Download
          </button>
        </div>
      </div>

      {/* Table Card */}
      <div className="riders-table-card">
        <div className="riders-table-wrap">
          <table className="riders-table">
            <thead>
              <tr>
                <th className="riders-col-select">
                  <input
                    type="checkbox"
                    className="riders-checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleAllVisible}
                    aria-label="Select all visible riders"
                  />
                </th>
                <th className="riders-col-index">#</th>
                <th className="riders-col-rider">Rider</th>
                <th className="riders-col-company">Affiliation / Company</th>
                <th className="riders-col-vehicle">Vehicle / Deliveries</th>
                <th className="riders-col-status">Availability</th>
                <th className="riders-col-approval">Approval</th>
                <th className="riders-col-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageRiders.map((rider, index) => {
                const recordKey = getRiderRecordKey(rider)
                const isSelected = selected.has(recordKey)
                const isMenuOpen = openMenuKey === recordKey
                const rowIndex = (activePage - 1) * ridersPerPage + index + 1
                const isPending = /pending/i.test(rider.approvalStatus ?? '')
                const isApproved = /^(approved|active)$/i.test(rider.approvalStatus ?? 'Approved')
                const isOnline = /^(online|available)$/i.test(rider.status)
                const availabilityReason = /break/i.test(rider.status)
                  ? 'Rider is on break'
                  : 'Rider is offline'

                return (
                  <tr key={recordKey} className={isSelected ? 'is-selected' : undefined}>
                    <td className="riders-col-select">
                      <input
                        type="checkbox"
                        className="riders-checkbox"
                        checked={isSelected}
                        onChange={() => toggleRiderSelection(recordKey)}
                        aria-label={`Select ${rider.primary}`}
                      />
                    </td>
                    <td className="riders-col-index">
                      <span className="riders-index-number">{rowIndex}</span>
                    </td>
                    <td className="riders-col-rider">
                      <div className="riders-profile-cell">
                        <span className="riders-avatar" aria-hidden="true">
                          {getRiderInitials(rider.primary)}
                        </span>
                        <div className="riders-profile-text">
                          <strong className="riders-name">{rider.primary}</strong>
                          <span className="riders-contact">{rider.secondary}</span>
                        </div>
                      </div>
                    </td>
                    <td className="riders-col-company">
                      <span className="riders-company-text">{rider.category}</span>
                    </td>
                    <td className="riders-col-vehicle">
                      <span className="riders-vehicle-text">{rider.value}</span>
                    </td>
                    <td className="riders-col-status">
                      <span className={`riders-status-pill ${getAvailabilityClass(rider.status)}`}>
                        <span className="riders-pill-dot" aria-hidden="true" />
                        {rider.status}
                      </span>
                    </td>
                    <td className="riders-col-approval">
                      <span
                        className={`riders-status-pill ${getApprovalClass(rider.approvalStatus)}`}
                      >
                        <span className="riders-pill-dot" aria-hidden="true" />
                        {rider.approvalStatus ?? 'Approved'}
                      </span>
                    </td>
                    <td className="riders-col-actions">
                      <div className="riders-actions-wrap">
                        <button
                          type="button"
                          className={`riders-menu-trigger ${isMenuOpen ? 'is-active' : ''}`}
                          onClick={(event) => toggleMenu(recordKey, event.currentTarget)}
                          aria-expanded={isMenuOpen}
                          aria-label={`Actions for ${rider.primary}`}
                        >
                          <Icon name="more" size={18} />
                        </button>

                        {isMenuOpen &&
                          menuPosition &&
                          createPortal(
                            <div
                              className={`riders-dropdown-menu placement-${menuPosition.placement}`}
                              role="menu"
                              style={{
                                top: menuPosition.top,
                                bottom: menuPosition.bottom,
                                right: menuPosition.right,
                              }}
                            >
                              <button
                                type="button"
                                className="riders-dropdown-item"
                                role="menuitem"
                                onClick={() => {
                                  closeMenu()
                                  setProfileRider(rider)
                                }}
                              >
                                <Icon name="eye" size={16} />
                                <span>View profile</span>
                              </button>

                              <button
                                type="button"
                                className="riders-dropdown-item"
                                role="menuitem"
                                onClick={() => {
                                  closeMenu()
                                  setEditRider(rider)
                                }}
                              >
                                <Icon name="edit" size={16} />
                                <span>Edit rider</span>
                              </button>

                              {isApproved ? (
                                <>
                                  <button
                                    type="button"
                                    className="riders-dropdown-item riders-dropdown-item--assignment"
                                    role="menuitem"
                                    disabled={!isOnline}
                                    onClick={() => {
                                      closeMenu()
                                      setAssignmentRider(rider)
                                    }}
                                  >
                                    <Icon name="truck" size={16} />
                                    <span>
                                      Assign delivery
                                      {!isOnline && <small>{availabilityReason}</small>}
                                    </span>
                                  </button>
                                  <div className="riders-submenu-container">
                                    <button
                                      type="button"
                                      className="riders-dropdown-item"
                                      role="menuitem"
                                      aria-expanded={submenuOpen}
                                      onClick={() => setSubmenuOpen(!submenuOpen)}
                                    >
                                      <Icon name="refresh" size={16} />
                                      <span>Change availability</span>
                                      <Icon name="chevronRight" size={14} />
                                    </button>
                                    {submenuOpen && (
                                      <div className="riders-dropdown-submenu" role="menu">
                                        {['Online', 'Offline', 'On Break'].map((status) => (
                                          <button
                                            key={status}
                                            type="button"
                                            className="riders-dropdown-subitem"
                                            role="menuitem"
                                            aria-current={
                                              rider.status.toLowerCase() === status.toLowerCase()
                                                ? 'true'
                                                : undefined
                                            }
                                            onClick={() => updateRiderStatus(recordKey, status)}
                                          >
                                            <span
                                              className={`riders-subitem-dot ${getAvailabilityClass(status)}`}
                                            />
                                            {status}
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </>
                              ) : isPending ? (
                                <>
                                  <button
                                    type="button"
                                    className="riders-dropdown-item is-approve"
                                    role="menuitem"
                                    onClick={() => {
                                      closeMenu()
                                      setApprovalRider(rider)
                                    }}
                                  >
                                    <Icon name="checkCircle" size={16} />
                                    <span>Approve rider</span>
                                  </button>
                                  <button
                                    type="button"
                                    className="riders-dropdown-item"
                                    role="menuitem"
                                    onClick={() => {
                                      closeMenu()
                                      setRejectionRider(rider)
                                    }}
                                  >
                                    <Icon name="close" size={16} />
                                    <span>Reject application</span>
                                  </button>
                                </>
                              ) : null}

                              <div className="riders-dropdown-divider" />

                              <button
                                type="button"
                                className="riders-dropdown-item is-danger"
                                role="menuitem"
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      `Are you sure you want to delete rider ${rider.primary}?`,
                                    )
                                  ) {
                                    deleteRiderRecord(recordKey)
                                    onDeleteRider?.(rider)
                                  }
                                }}
                              >
                                <Icon name="trash" size={16} />
                                <span>Delete rider</span>
                              </button>
                            </div>,
                            document.body,
                          )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {pageRiders.length === 0 && (
            <div className="riders-empty-state">No matching riders found.</div>
          )}
        </div>

        <div className="riders-table-footer">
          <span className="riders-showing-count">
            Showing {(activePage - 1) * ridersPerPage + (pageRiders.length ? 1 : 0)} to{' '}
            {(activePage - 1) * ridersPerPage + pageRiders.length} of {filteredRiders.length} riders
          </span>
          <nav className="riders-pagination" aria-label="Riders pages">
            <button
              type="button"
              className="riders-page-btn"
              disabled={activePage === 1}
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
            >
              Prev
            </button>
            {pageNumbers.map((page) => (
              <button
                key={page}
                type="button"
                className={`riders-page-number ${activePage === page ? 'is-active' : ''}`}
                onClick={() => setCurrentPage(page)}
                aria-current={activePage === page ? 'page' : undefined}
              >
                {page}
              </button>
            ))}
            <button
              type="button"
              className="riders-page-btn"
              disabled={activePage === totalPages}
              onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
            >
              Next
            </button>
          </nav>
        </div>
      </div>
      {profileRider && (
        <RiderProfileModal
          rider={profileRider}
          onClose={() => setProfileRider(null)}
          onReview={() => {
            setProfileRider(null)
            onOpen(profileRider)
          }}
        />
      )}
      {editRider && (
        <EditRiderModal
          rider={editRider}
          onClose={() => setEditRider(null)}
          onSaved={onRiderSaved}
        />
      )}
      {approvalRider && (
        <ApproveRiderModal
          rider={approvalRider}
          onClose={() => setApprovalRider(null)}
          onApprove={(message) => onApproveRider(approvalRider, message)}
        />
      )}
      {rejectionRider && (
        <RejectRiderModal
          rider={rejectionRider}
          onClose={() => setRejectionRider(null)}
          onReject={(reason) => onRejectRider(rejectionRider, reason)}
        />
      )}
      {assignmentRider && (
        <AssignDeliveryToRiderModal
          rider={assignmentRider}
          onClose={() => setAssignmentRider(null)}
          onAssigned={(orderId) => onDeliveryAssigned?.(assignmentRider, orderId)}
        />
      )}
    </section>
  )
}
