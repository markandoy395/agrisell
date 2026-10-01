import { useState } from 'react'
import { Icon } from '../../components/ui/icon/Icon'
import type { CreateSupportTicketPayload } from '../../api/adminSupportApi'
import type { UserWorkspaceRow } from '../../types/userWorkspace'

type CreateSupportTicketModalProps = {
  isOpen: boolean
  users?: UserWorkspaceRow[]
  onClose: () => void
  onSubmit: (payload: CreateSupportTicketPayload) => Promise<void>
}

const CATEGORIES = [
  'order',
  'delivery',
  'payment',
  'account',
  'safety',
  'general',
]

export function CreateSupportTicketModal({
  isOpen,
  users = [],
  onClose,
  onSubmit,
}: CreateSupportTicketModalProps) {
  const [userId, setUserId] = useState('')
  const [subject, setSubject] = useState('')
  const [category, setCategory] = useState(CATEGORIES[0])
  const [priority, setPriority] = useState('medium')
  const [initialMessage, setInitialMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userId || !subject.trim()) return

    setIsSubmitting(true)
    try {
      await onSubmit({
        userId,
        subject: subject.trim(),
        category,
        priority,
        initialMessage: initialMessage.trim() || undefined,
      })
      // Reset form
      setUserId('')
      setSubject('')
      setCategory(CATEGORIES[0])
      setPriority('medium')
      setInitialMessage('')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="support-modal-backdrop" onClick={onClose}>
      <div
        className="support-modal-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="create-ticket-modal-title"
      >
        <div className="support-modal-header">
          <h3 id="create-ticket-modal-title">Create New Support Ticket</h3>
          <button
            type="button"
            className="support-modal-close-btn"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="support-modal-body">
            {/* 1. Customer Selection */}
            <div className="support-form-group">
              <label htmlFor="support-user-select">Customer / User *</label>
              {users.length > 0 ? (
                <select
                  id="support-user-select"
                  className="support-form-select"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  required
                >
                  <option value="">-- Select Customer --</option>
                  {users.map((u) => {
                    const fullName = `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email || `User #${u.userId}`
                    return (
                      <option key={u.userId} value={u.userId}>
                        {fullName} ({u.userType}) - {u.email || u.contactNumber || u.userId}
                      </option>
                    )
                  })}
                </select>
              ) : (
                <input
                  id="support-user-select"
                  type="text"
                  className="support-form-input"
                  placeholder="Enter User ID"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  required
                />
              )}
            </div>

            {/* 2. Subject */}
            <div className="support-form-group">
              <label htmlFor="support-subject-input">Subject *</label>
              <input
                id="support-subject-input"
                type="text"
                className="support-form-input"
                placeholder="e.g. Incomplete delivery for Order #1042"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                required
              />
            </div>

            {/* 3. Category & Priority */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="support-form-group">
                <label htmlFor="support-category-select">Category</label>
                <select
                  id="support-category-select"
                  className="support-form-select"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat.toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>

              <div className="support-form-group">
                <label htmlFor="support-priority-select">Priority</label>
                <select
                  id="support-priority-select"
                  className="support-form-select"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
            </div>

            {/* 4. Initial Message */}
            <div className="support-form-group">
              <label htmlFor="support-message-input">Initial Message (Optional)</label>
              <textarea
                id="support-message-input"
                className="support-form-textarea"
                placeholder="Details of the customer inquiry or initial outreach note…"
                rows={3}
                value={initialMessage}
                onChange={(e) => setInitialMessage(e.target.value)}
              />
            </div>
          </div>

          <div className="support-modal-footer">
            <button
              type="button"
              className="support-modal-cancel-btn"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="support-modal-submit-btn"
              disabled={isSubmitting || !userId || !subject.trim()}
            >
              {isSubmitting ? 'Creating…' : 'Create Ticket'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
