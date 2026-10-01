import type { DashboardModal } from '../../../types/dashboard'
import { CloseButton } from '../closeButton/CloseButton'

type DetailsModalProps = { modal: DashboardModal; onClose: () => void }

export function DetailsModal({ modal, onClose }: DetailsModalProps) {
  if (!modal) return null
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <CloseButton label="Close details modal" onClick={onClose} />
        <header className="modal-header">
          <span className="modal-eyebrow">DETAILS</span>
          <h2 id="modal-title">{modal.title}</h2>
        </header>
        <p className="modal-copy">{modal.message}</p>
        <div className="modal-actions modal-actions--single">
          <button className="primary-button" onClick={onClose}>
            Done
          </button>
        </div>
      </section>
    </div>
  )
}
