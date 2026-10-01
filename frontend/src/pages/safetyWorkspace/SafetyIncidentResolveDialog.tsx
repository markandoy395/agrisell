import { useState, useRef } from 'react'
import type { FormEvent, DragEvent, ChangeEvent } from 'react'
import { CloseButton } from '../../components/ui/closeButton/CloseButton'
import { Icon } from '../../components/ui/icon/Icon'
import type { SafetyIncident } from './safetyWorkspace.types'

type SafetyIncidentResolveDialogProps = {
  incident: SafetyIncident | null
  onClose: () => void
  onSubmit: (reportId: string, status: string, notes: string) => Promise<void>
  onViewReport?: (reportId: string) => void
}

type ResolutionOutcomeOption = {
  id: string
  label: string
  defaultNote: string
  isSafe?: boolean
}

const OUTCOME_OPTIONS: ResolutionOutcomeOption[] = [
  {
    id: 'rider_safe',
    label: 'Rider is Safe (False Alarm)',
    defaultNote:
      'Contacted the rider and confirmed that they are safe. It was a false alarm triggered by accident. No further assistance needed.',
    isSafe: true,
  },
  {
    id: 'rider_contacted',
    label: 'Rider Contacted (Situation Under Control)',
    defaultNote:
      'Contacted the rider via phone. Situation is under control and rider is continuing delivery safely.',
  },
  {
    id: 'assistance_dispatched',
    label: 'Assistance Dispatched (Ongoing)',
    defaultNote:
      'Roadside assistance and replacement support dispatched to the rider’s current location.',
  },
  {
    id: 'escalated_authorities',
    label: 'Escalated to Authorities',
    defaultNote:
      'Incident escalated to local emergency responders and authorities for immediate intervention.',
  },
  {
    id: 'other',
    label: 'Other',
    defaultNote: 'Resolution actions taken and confirmed with the rider.',
  },
]

type AttachedFile = {
  file: File
  name: string
  sizeText: string
  previewUrl: string
}

export function SafetyIncidentResolveDialog({
  incident,
  onClose,
  onSubmit,
  onViewReport,
}: SafetyIncidentResolveDialogProps) {
  if (!incident) return null

  const role = incident.reporter_role || (incident.rider_id ? 'rider' : 'buyer')
  const reporterRoleLabel = role === 'buyer' ? 'BUYER' : role === 'farmer' ? 'FARMER' : 'RIDER'
  const reporterName =
    incident.reporter?.name ||
    incident.reporter_name ||
    incident.rider?.full_name ||
    `${reporterRoleLabel} Reporter`
  const contactNumber =
    incident.reporter?.contact_number ||
    incident.reporter_contact ||
    incident.rider?.contact_number
  const email = incident.reporter?.email || incident.reporter_email || incident.rider?.email

  const [selectedOutcome, setSelectedOutcome] = useState<ResolutionOutcomeOption | null>(null)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [details, setDetails] = useState('')
  const [attachedFile, setAttachedFile] = useState<AttachedFile | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Success Step state
  const [isResolvedSuccess, setIsResolvedSuccess] = useState(false)
  const [resolvedTimestamp, setResolvedTimestamp] = useState('')

  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const handleSelectOutcome = (option: ResolutionOutcomeOption) => {
    setSelectedOutcome(option)
    setIsDropdownOpen(false)
    // If details are empty or currently set to another default note, auto-fill with selected outcome's note
    const isCurrentTextADefault = OUTCOME_OPTIONS.some((o) => o.defaultNote === details.trim())
    if (!details.trim() || isCurrentTextADefault) {
      setDetails(option.defaultNote)
    }
  }

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      processFile(file)
    }
  }

  const processFile = (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      setError('File exceeds maximum size of 5MB.')
      return
    }
    setError('')
    const sizeInKb = Math.round(file.size / 1024)
    const sizeText = sizeInKb > 1024 ? `${(sizeInKb / 1024).toFixed(1)} MB` : `${sizeInKb} KB`
    const previewUrl = file.type.startsWith('image/')
      ? URL.createObjectURL(file)
      : ''
    setAttachedFile({ file, name: file.name, sizeText, previewUrl })
  }

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  const handleDrop = (e: DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) {
      processFile(file)
    }
  }

  const handleRemoveFile = () => {
    if (attachedFile?.previewUrl) {
      URL.revokeObjectURL(attachedFile.previewUrl)
    }
    setAttachedFile(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!selectedOutcome) {
      setError('Please select a resolution outcome.')
      return
    }
    if (!details.trim()) {
      setError('Resolution details are required.')
      return
    }

    setIsSubmitting(true)
    setError('')

    try {
      const fullNotes = attachedFile
        ? `[Outcome: ${selectedOutcome.label}]\n${details.trim()}\n• Attached evidence: ${attachedFile.name} (${attachedFile.sizeText})`
        : `[Outcome: ${selectedOutcome.label}]\n${details.trim()}`

      await onSubmit(incident.report_id, 'resolved', fullNotes)

      // Set formatted resolved at time for confirmation screen
      const now = new Date()
      const formattedAt = now.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })
      setResolvedTimestamp(formattedAt)
      setIsResolvedSuccess(true)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save resolution.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const timeAgo = formatTimeAgo(new Date(incident.reported_at || incident.created_at))
  const isFormValid = Boolean(selectedOutcome && details.trim().length > 0)

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        className={`modal-card safety-resolve-modal ${isResolvedSuccess ? 'modal-success-state' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="resolve-modal-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <CloseButton label="Close resolution modal" onClick={onClose} />

        {/* ================================================================
            PHASE 4: Emergency SOS Resolved! Confirmation Screen
            ================================================================ */}
        {isResolvedSuccess ? (
          <div className="resolve-success-container">
            {/* Celebration Icon with Confetti */}
            <div className="success-celebration-graphic">
              <span className="confetti-dot c1" />
              <span className="confetti-dot c2" />
              <span className="confetti-dot c3" />
              <span className="confetti-dot c4" />
              <span className="confetti-dot c5" />
              <span className="confetti-dot c6" />
              <span className="confetti-dot c7" />
              <span className="confetti-dot c8" />
              <div className="success-badge-circle">
                <Icon name="check" size={36} />
              </div>
            </div>

            <h2 id="resolve-modal-title" className="success-title">
              Emergency SOS Resolved!
            </h2>
            <p className="success-subtitle">
              The emergency report has been successfully marked as resolved.
            </p>

            {/* Resolved Incident Details Card */}
            <div className="success-details-card">
              <div className="success-detail-row">
                <div className="detail-row-left">
                  <Icon name="shield" size={16} />
                  <span>Incident ID</span>
                </div>
                <strong className="detail-row-value">{incident.report_id}</strong>
              </div>

              <div className="success-detail-row">
                <div className="detail-row-left">
                  <Icon name="profile" size={16} />
                  <span>{reporterRoleLabel === 'FARMER' ? 'Farmer' : reporterRoleLabel === 'BUYER' ? 'Buyer' : 'Rider'}</span>
                </div>
                <strong className="detail-row-value">{reporterName}</strong>
              </div>

              <div className="success-detail-row">
                <div className="detail-row-left">
                  <Icon name="checkCircle" size={16} />
                  <span>Resolution</span>
                </div>
                <strong className="detail-row-value text-success">
                  {selectedOutcome?.label || 'Resolved'}
                </strong>
              </div>

              <div className="success-detail-row">
                <div className="detail-row-left">
                  <Icon name="profile" size={16} />
                  <span>Resolved by</span>
                </div>
                <strong className="detail-row-value">Admin</strong>
              </div>

              <div className="success-detail-row">
                <div className="detail-row-left">
                  <Icon name="clock" size={16} />
                  <span>Resolved at</span>
                </div>
                <strong className="detail-row-value">{resolvedTimestamp}</strong>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="success-actions-col">
              <button
                type="button"
                className="btn-success-primary"
                onClick={() => {
                  if (onViewReport) {
                    onViewReport(incident.report_id)
                  } else {
                    onClose()
                  }
                }}
              >
                <span>View Updated Report</span>
                <span className="arrow-glyph">→</span>
              </button>

              <button
                type="button"
                className="btn-success-secondary"
                onClick={onClose}
              >
                Back to Safety & SOS
              </button>
            </div>
          </div>
        ) : (
          /* ================================================================
              PHASE 2 & 3: Form Input & Outcome Selection Screen
              ================================================================ */
          <div className="resolve-form-container">
            <header className="modal-header-section">
              <h2 id="resolve-modal-title">Resolve Emergency SOS</h2>
              <p className="modal-subtitle-text">
                Complete the resolution details and confirm to close this emergency report.
              </p>
            </header>

            {/* Summary Information Card */}
            <div className="resolve-summary-card">
              <div className="summary-card-top-row">
                <div className="summary-badges-group">
                  <span className="summary-badge-sos">
                    <Icon name="siren" size={12} />
                    <span>EMERGENCY SOS</span>
                  </span>
                  <span className="summary-role-label">{reporterRoleLabel}</span>
                  <span className="summary-incident-id">ID: {incident.report_id}</span>
                </div>
                <span className="summary-time-ago">{timeAgo}</span>
              </div>

              <div className="summary-contact-list">
                <div className="summary-contact-row">
                  <Icon name="profile" size={15} />
                  <strong className="contact-name-text">{reporterName}</strong>
                </div>
                {contactNumber && (
                  <div className="summary-contact-row text-phone-row">
                    <Icon name="phone" size={15} />
                    <span>{contactNumber}</span>
                  </div>
                )}
                {email && (
                  <div className="summary-contact-row text-email-row">
                    <Icon name="mail" size={15} />
                    <span>{email}</span>
                  </div>
                )}
              </div>
            </div>

            <form onSubmit={handleSubmit} className="resolve-fields-form">
              {/* Field 1: Resolution Outcome Custom Dropdown */}
              <div className="resolve-form-group">
                <label className="resolve-field-label">
                  Resolution Outcome <span className="required-star">*</span>
                </label>

                <div className="custom-select-container">
                  <button
                    type="button"
                    className={`custom-select-trigger ${isDropdownOpen ? 'is-open' : ''} ${selectedOutcome ? 'has-value' : ''}`}
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    aria-expanded={isDropdownOpen}
                  >
                    <span>{selectedOutcome ? selectedOutcome.label : 'Select resolution outcome'}</span>
                    <span className={`chevron-indicator ${isDropdownOpen ? 'rotate-180' : ''}`}>
                      <Icon name="chevron" size={16} />
                    </span>
                  </button>

                  {isDropdownOpen && (
                    <div className="custom-select-dropdown" role="listbox">
                      {OUTCOME_OPTIONS.map((option) => {
                        const isSelected = selectedOutcome?.id === option.id
                        return (
                          <div
                            key={option.id}
                            className={`dropdown-option-row ${isSelected ? 'selected' : ''}`}
                            onClick={() => handleSelectOutcome(option)}
                            role="option"
                            aria-selected={isSelected}
                          >
                            <span className={`option-dot ${option.isSafe ? 'dot-safe' : 'dot-danger'}`} />
                            <span className="option-label">{option.label}</span>
                            {isSelected && (
                              <span className="option-check">
                                <Icon name="check" size={16} />
                              </span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Field 2: Resolution Details Textarea */}
              <div className="resolve-form-group">
                <label className="resolve-field-label">
                  Resolution Details <span className="required-star">*</span>
                </label>
                <div className="textarea-wrapper">
                  <textarea
                    rows={4}
                    maxLength={500}
                    placeholder="Enter how the emergency was handled, actions taken, and current status..."
                    value={details}
                    onChange={(e) => setDetails(e.target.value)}
                    required
                  />
                  <div className="character-counter">{details.length}/500</div>
                </div>
              </div>

              {/* Field 3: Attach Evidence (Optional) */}
              <div className="resolve-form-group">
                <label className="resolve-field-label">
                  Attach Evidence (Optional)
                </label>

                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/*,.pdf,.doc,.docx"
                  style={{ display: 'none' }}
                />

                {!attachedFile ? (
                  <div
                    className={`evidence-dropzone ${isDragging ? 'is-dragging' : ''}`}
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                  >
                    <div className="dropzone-icon-wrap">
                      <Icon name="upload" size={24} />
                    </div>
                    <div className="dropzone-text-col">
                      <strong className="dropzone-title">Click to upload or drag and drop</strong>
                      <span className="dropzone-subtitle">Images, documents (Max 5MB)</span>
                    </div>
                  </div>
                ) : (
                  <div className="evidence-preview-row">
                    <button
                      type="button"
                      className="btn-upload-reselect"
                      onClick={() => fileInputRef.current?.click()}
                      title="Upload another file"
                    >
                      <Icon name="upload" size={18} />
                    </button>

                    <div className="file-preview-card">
                      <div className="file-thumbnail">
                        {attachedFile.previewUrl ? (
                          <img src={attachedFile.previewUrl} alt="Evidence preview" />
                        ) : (
                          <Icon name="document" size={20} />
                        )}
                      </div>
                      <div className="file-meta-col">
                        <strong className="file-name" title={attachedFile.name}>
                          {attachedFile.name}
                        </strong>
                        <span className="file-size">{attachedFile.sizeText}</span>
                      </div>
                      <button
                        type="button"
                        className="btn-remove-file"
                        onClick={handleRemoveFile}
                        title="Remove attached evidence"
                      >
                        <Icon name="close" size={14} />
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {error && (
                <p className="resolve-form-error" role="alert">
                  {error}
                </p>
              )}

              {/* Footer Actions */}
              <div className="resolve-modal-footer">
                <button
                  type="button"
                  className="btn-modal-cancel"
                  onClick={onClose}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`btn-modal-submit ${isFormValid ? 'active' : 'disabled'}`}
                  disabled={!isFormValid || isSubmitting}
                >
                  {isSubmitting ? 'Marking as Resolved…' : 'Mark as Resolved'}
                </button>
              </div>
            </form>
          </div>
        )}
      </section>
    </div>
  )
}

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'Just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
