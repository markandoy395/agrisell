import { useState, useEffect, useRef, useId } from 'react'
import { generateQrDataUrl } from './qrCode'
import './ContactCallingModal.css'

export type ContactOutcomeType = 'contacted' | 'no_answer' | 'escalated'

export interface ContactCallingModalProps {
  isOpen: boolean
  onClose: () => void
  contactName: string
  contactNumber: string
  contactRole?: 'farmer' | 'buyer' | 'rider' | string
  contactAvatarUrl?: string | null
  referenceId?: string | null
  referenceType?: string
  onSaveLog?: (log: {
    outcome: ContactOutcomeType
    outcomeLabel: string
    notes: string
    contactName: string
    contactNumber: string
    timestamp: string
  }) => Promise<void> | void
}

export function ContactCallingModal({
  isOpen,
  onClose,
  contactName,
  contactNumber,
  contactRole = 'farmer',
  contactAvatarUrl,
  referenceId,
  referenceType = 'Incident ID',
  onSaveLog,
}: ContactCallingModalProps) {
  const [selectedOutcome, setSelectedOutcome] = useState<ContactOutcomeType | null>(null)
  const [notes, setNotes] = useState('')
  const [isCopied, setIsCopied] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [showMobileDrawer, setShowMobileDrawer] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isSavedSuccess, setIsSavedSuccess] = useState(false)

  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const notesSectionRef = useRef<HTMLDivElement | null>(null)
  const titleId = useId()

  // Generate QR code when modal is opened
  useEffect(() => {
    if (isOpen && contactNumber) {
      let cancelled = false
      generateQrDataUrl(contactNumber, 200)
        .then((url) => {
          if (!cancelled) setQrDataUrl(url)
        })
        .catch(() => {
          if (!cancelled) setQrDataUrl(null)
        })
      return () => {
        cancelled = true
      }
    }
  }, [isOpen, contactNumber])

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedOutcome(null)
      setNotes('')
      setIsCopied(false)
      setToastMessage(null)
      setShowMobileDrawer(false)
      setIsSaving(false)
      setIsSavedSuccess(false)
    }
  }, [isOpen])

  // Handle ESC key and lock body scroll
  useEffect(() => {
    if (!isOpen) return
    const originalOverflow = document.body.style.overflow
    const originalPaddingRight = document.body.style.paddingRight
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = originalOverflow
      document.body.style.paddingRight = originalPaddingRight
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  // Normalize role terms
  const roleLower = contactRole.toLowerCase()
  const roleLabel =
    roleLower === 'buyer' ? 'Buyer' : roleLower === 'rider' ? 'Rider' : 'Farmer'
  const roleArticle =
    roleLower === 'buyer'
      ? 'this buyer'
      : roleLower === 'rider'
        ? 'this rider'
        : 'this farmer'
  const roleNoun =
    roleLower === 'buyer'
      ? 'the buyer'
      : roleLower === 'rider'
        ? 'the rider'
        : 'the farmer'
  const rolePossessive =
    roleLower === 'buyer'
      ? "the buyer's"
      : roleLower === 'rider'
        ? "the rider's"
        : "the farmer's"

  const showToast = (message: string) => {
    setToastMessage(message)
    setTimeout(() => {
      setToastMessage((current) => (current === message ? null : current))
    }, 2800)
  }

  // Copy phone number
  const handleCopyNumber = async () => {
    try {
      await navigator.clipboard.writeText(contactNumber)
      setIsCopied(true)
      showToast('Number copied to clipboard!')
      setTimeout(() => setIsCopied(false), 2400)
    } catch {
      showToast(`Phone: ${contactNumber}`)
    }
  }

  // Send to mobile
  const handleSendToMobile = () => {
    const nextState = !showMobileDrawer
    setShowMobileDrawer(nextState)
    showToast(nextState ? 'Scan QR with phone camera to call' : 'Mobile drawer closed')
  }

  // Scroll to and focus contact notes
  const handleOpenContactLog = () => {
    if (notesSectionRef.current) {
      notesSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
    setTimeout(() => {
      textareaRef.current?.focus()
    }, 150)
  }

  // Save log
  const handleSaveContactLog = async () => {
    if (!selectedOutcome && !notes.trim()) return

    const outcomeLabels: Record<ContactOutcomeType, string> = {
      contacted: 'Mark Contacted - Responded',
      no_answer: 'No Answer - Try again later',
      escalated: 'Escalate - Notify dispatch',
    }

    const outcome = selectedOutcome ?? 'contacted'
    const outcomeLabel = outcomeLabels[outcome]

    setIsSaving(true)
    try {
      if (onSaveLog) {
        await onSaveLog({
          outcome,
          outcomeLabel,
          notes: notes.trim(),
          contactName,
          contactNumber,
          timestamp: new Date().toISOString(),
        })
      }
      setIsSavedSuccess(true)
      setTimeout(() => {
        onClose()
      }, 1200)
    } catch {
      showToast('Error saving contact log.')
      setIsSaving(false)
    }
  }

  const isSaveReady = Boolean(selectedOutcome || notes.trim())
  const cleanPhone = contactNumber.replace(/[\s\-()]/g, '')

  return (
    <div
      className="contact-call-backdrop"
      onMouseDown={onClose}
      role="presentation"
    >
      <div
        className="contact-call-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Toast notification */}
        {toastMessage && (
          <div className="contact-toast-notification" role="status" aria-live="polite">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Modal Header */}
        <header className="contact-call-header">
          <div className="contact-header-icon-wrap" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
          </div>

          <div className="contact-header-titles">
            <h2 id={titleId} className="contact-header-title">
              Contact {roleLabel}
            </h2>
            <p className="contact-header-subtitle">
              Desktop admins can't call directly from the web dashboard. Use {rolePossessive} number with your phone or connected calling tool.
            </p>
          </div>

          <button
            type="button"
            className="contact-close-btn"
            onClick={onClose}
            aria-label="Close contact dialog"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="6" />
            </svg>
          </button>
        </header>

        {/* Modal Body / Success State */}
        {isSavedSuccess ? (
          <div className="contact-modal-success">
            <div className="contact-success-badge">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h3 className="contact-success-title">Contact Log Saved!</h3>
            <p className="contact-success-desc">
              Your contact record and notes have been successfully added to the system audit.
            </p>
          </div>
        ) : (
          <div className="contact-call-body">
            {/* Profile Card */}
            <div className="contact-profile-card">
              <div className="contact-profile-avatar" aria-hidden="true">
                {contactAvatarUrl ? (
                  <img src={contactAvatarUrl} alt={contactName} />
                ) : (
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="12" cy="8" r="4.5" />
                    <path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7" />
                  </svg>
                )}
              </div>

              <div className="contact-profile-info">
                <strong className="contact-profile-name">{contactName || `${roleLabel} Contact`}</strong>

                <div className="contact-profile-phone-row">
                  <span className="contact-phone-icon" aria-hidden="true">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M6.62 10.79a15.053 15.053 0 006.59 6.59l2.2-2.2a1 1 0 011.02-.24c1.12.37 2.33.57 3.57.57a1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1c0 1.25.2 2.45.57 3.57a1 1 0 01-.24 1.02l-2.21 2.2z" />
                    </svg>
                  </span>

                  <span className="contact-phone-number">{contactNumber}</span>

                  <button
                    type="button"
                    className={`contact-copy-inline-btn ${isCopied ? 'copied' : ''}`}
                    onClick={handleCopyNumber}
                    title="Copy phone number"
                    aria-label="Copy phone number"
                  >
                    {isCopied ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                    )}
                  </button>
                </div>

                {referenceId && (
                  <div className="contact-reference-id">
                    {referenceType}: {referenceId}
                  </div>
                )}
              </div>
            </div>

            {/* Info Notice Banner */}
            <div className="contact-info-banner">
              <span className="contact-info-icon-circle" aria-hidden="true">
                i
              </span>
              <div className="contact-info-content">
                <h4 className="contact-info-heading">
                  Use your phone or integrated call tool to contact {roleArticle}.
                </h4>
                <p className="contact-info-text">
                  You can copy the number, send it to your mobile device, or log the outcome below.
                </p>
              </div>
            </div>

            {/* 3 Quick Action Buttons */}
            <div className="contact-actions-row">
              <button
                type="button"
                className="contact-action-btn btn-solid-green"
                onClick={handleCopyNumber}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                <span>{isCopied ? 'Copied!' : 'Copy Number'}</span>
              </button>

              <button
                type="button"
                className="contact-action-btn btn-outline-green"
                onClick={handleSendToMobile}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                  <line x1="12" y1="18" x2="12.01" y2="18" />
                </svg>
                <span>Send to Mobile</span>
              </button>

              <button
                type="button"
                className="contact-action-btn btn-outline-green"
                onClick={handleOpenContactLog}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
                <span>Open Contact Log</span>
              </button>
            </div>

            {/* Mobile Scan & Dial Drawer */}
            {showMobileDrawer && (
              <div className="contact-mobile-drawer">
                <div className="contact-mobile-qr-wrap">
                  {qrDataUrl ? (
                    <img
                      src={qrDataUrl}
                      alt={`QR code to call ${contactNumber}`}
                      width={180}
                      height={180}
                      className="contact-mobile-qr-img"
                    />
                  ) : (
                    <div className="contact-qr-placeholder">Generating QR code...</div>
                  )}
                </div>
                <h4 className="contact-mobile-title">Point Phone Camera to Call</h4>
                <p className="contact-mobile-hint">
                  Open your smartphone camera and point it at this QR code. Tap the notification banner to instantly dial <strong>{contactNumber}</strong>.
                </p>
                <div className="contact-mobile-quick-links">
                  <a
                    href={`tel:${cleanPhone}`}
                    className="contact-mobile-dial-link"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Launch laptop dialer ({cleanPhone})
                  </a>
                  <span className="contact-mobile-divider">·</span>
                  <a
                    href={`sms:${cleanPhone}`}
                    className="contact-mobile-dial-link"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Send SMS
                  </a>
                </div>
              </div>
            )}

            {/* CONTACT OUTCOME Section */}
            <div className="contact-section">
              <span className="contact-section-label">CONTACT OUTCOME</span>
              <p className="contact-section-sub">
                Update the status after attempting to contact {roleNoun}.
              </p>

              <div className="contact-outcomes-grid">
                {/* 1. Mark Contacted */}
                <button
                  type="button"
                  className={`contact-outcome-card card-contacted ${
                    selectedOutcome === 'contacted' ? 'selected' : ''
                  }`}
                  onClick={() =>
                    setSelectedOutcome((prev) => (prev === 'contacted' ? null : 'contacted'))
                  }
                >
                  <span className="outcome-icon-wrap" aria-hidden="true">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </span>
                  <div className="outcome-texts">
                    <strong className="outcome-title">Mark Contacted</strong>
                    <span className="outcome-subtext">{roleLabel} responded</span>
                  </div>
                </button>

                {/* 2. No Answer */}
                <button
                  type="button"
                  className={`contact-outcome-card card-no-answer ${
                    selectedOutcome === 'no_answer' ? 'selected' : ''
                  }`}
                  onClick={() =>
                    setSelectedOutcome((prev) => (prev === 'no_answer' ? null : 'no_answer'))
                  }
                >
                  <span className="outcome-icon-wrap" aria-hidden="true">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                  </span>
                  <div className="outcome-texts">
                    <strong className="outcome-title">No Answer</strong>
                    <span className="outcome-subtext">Try again later</span>
                  </div>
                </button>

                {/* 3. Escalate */}
                <button
                  type="button"
                  className={`contact-outcome-card card-escalate ${
                    selectedOutcome === 'escalated' ? 'selected' : ''
                  }`}
                  onClick={() =>
                    setSelectedOutcome((prev) => (prev === 'escalated' ? null : 'escalated'))
                  }
                >
                  <span className="outcome-icon-wrap" aria-hidden="true">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2L1 21h22L12 2zm0 3.99L19.53 19H4.47L12 5.99zM11 10h2v4h-2zm0 6h2v2h-2z" />
                    </svg>
                  </span>
                  <div className="outcome-texts">
                    <strong className="outcome-title">Escalate</strong>
                    <span className="outcome-subtext">Notify dispatch</span>
                  </div>
                </button>
              </div>
            </div>

            {/* CONTACT NOTES Section */}
            <div className="contact-section" ref={notesSectionRef}>
              <span className="contact-section-label">CONTACT NOTES</span>
              <p className="contact-section-sub">
                Log your conversation, what {roleNoun} said, their condition, and next steps.
              </p>

              <div className="contact-notes-wrap">
                <textarea
                  ref={textareaRef}
                  className="contact-notes-textarea"
                  placeholder="Enter contact notes here..."
                  value={notes}
                  maxLength={500}
                  onChange={(e) => setNotes(e.target.value)}
                />
                <span className="contact-notes-counter" aria-hidden="true">
                  {notes.length}/500
                </span>
              </div>
            </div>

            {/* Save Contact Log Button */}
            <button
              type="button"
              className={`contact-save-btn ${isSaveReady ? 'btn-ready' : 'btn-disabled'}`}
              disabled={!isSaveReady || isSaving}
              onClick={handleSaveContactLog}
            >
              {isSaving ? (
                <>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="contact-save-spinner">
                    <line x1="12" y1="2" x2="12" y2="6" />
                    <line x1="12" y1="18" x2="12" y2="22" />
                    <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
                    <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
                    <line x1="2" y1="12" x2="6" y2="12" />
                    <line x1="18" y1="12" x2="22" y2="12" />
                    <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
                    <line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
                  </svg>
                  <span>Saving Contact Log...</span>
                </>
              ) : (
                <>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                    <polyline points="17 21 17 13 7 13 7 21" />
                    <polyline points="7 3 7 8 15 8" />
                  </svg>
                  <span>Save Contact Log</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
