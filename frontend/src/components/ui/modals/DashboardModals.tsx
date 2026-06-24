import type { FormEventHandler } from 'react'
import { entityInfo } from '../../../data/dashboardMock'
import type { Modal } from '../../../types/dashboard'

type DetailsModalProps = { modal: Modal; onClose: () => void }

export function DetailsModal({ modal, onClose }: DetailsModalProps) {
  if (!modal) return null
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" onClick={onClose} aria-label="Close">x</button><span className="modal-eyebrow">DETAILS</span><h2 id="modal-title">{modal.title}</h2><p>{modal.message}</p><button className="primary-button" onClick={onClose}>Done</button></section></div>
}

type AddRecordModalProps = {
  section: string | null
  name: string
  onNameChange: (value: string) => void
  onClose: () => void
  onSubmit: FormEventHandler<HTMLFormElement>
}

export function AddRecordModal({ section, name, onNameChange, onClose, onSubmit }: AddRecordModalProps) {
  if (!section) return null
  const info = entityInfo[section]
  return <div className="modal-backdrop"><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="add-title"><button className="modal-close" onClick={onClose} aria-label="Close">x</button><span className="modal-eyebrow">NEW {section.slice(0, -1).toUpperCase()}</span><h2 id="add-title">Add a {info.singular}</h2><form onSubmit={onSubmit}><label className="field-label">Name or reference<input autoFocus value={name} onChange={(event) => onNameChange(event.target.value)} placeholder={`Enter ${info.singular} name`} required/></label><div className="modal-actions"><button type="button" className="outline-button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit">Create record</button></div></form></section></div>
}
