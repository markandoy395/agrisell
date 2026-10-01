import type { FormEventHandler } from 'react'
import { getEntityInfo } from '../../../data/entityWorkspaceConfig'
import { CloseButton } from '../closeButton/CloseButton'

type AddRecordModalProps = {
  section: string | null
  name: string
  onNameChange: (value: string) => void
  onClose: () => void
  onSubmit: FormEventHandler<HTMLFormElement>
}

export function AddRecordModal(props: AddRecordModalProps) {
  if (!props.section) return null
  const info = getEntityInfo(props.section)
  return (
    <div className="modal-backdrop">
      <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="add-title">
        <CloseButton label={`Close add ${info.singular} modal`} onClick={props.onClose} />
        <header className="modal-header">
          <span className="modal-eyebrow">NEW {props.section.slice(0, -1).toUpperCase()}</span>
          <h2 id="add-title">Add a {info.singular}</h2>
        </header>
        <form onSubmit={props.onSubmit}>
          <label className="field-label">
            Name or reference
            <input
              autoFocus
              value={props.name}
              onChange={(event) => props.onNameChange(event.target.value)}
              placeholder={`Enter ${info.singular} name`}
              required
            />
          </label>
          <div className="modal-actions">
            <button type="button" className="outline-button" onClick={props.onClose}>
              Cancel
            </button>
            <button className="primary-button" type="submit">
              Create record
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
