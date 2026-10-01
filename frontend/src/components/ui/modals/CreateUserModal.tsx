import { useState, type FormEventHandler } from 'react'
import type { CreateUserInput } from '../../../api/adminData'
import { CloseButton } from '../closeButton/CloseButton'
import { CreateFarmerFields } from './CreateFarmerFields'
import { CreateUserFields } from './CreateUserFields'

type CreateUserModalProps = {
  defaultAccountType: CreateUserInput['accountType']
  onClose: () => void
  onCreate: (input: CreateUserInput) => Promise<void>
}

const emptyInput = (accountType: CreateUserInput['accountType']): CreateUserInput => ({
  accountType,
  email: '',
  firstName: '',
  lastName: '',
  password: '',
  verificationStatus: 'pending',
})

export function CreateUserModal(props: CreateUserModalProps) {
  const [draft, setDraft] = useState<CreateUserInput>(() => emptyInput(props.defaultAccountType))
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const update = <K extends keyof CreateUserInput>(key: K, value: CreateUserInput[K]) =>
    setDraft((current) => ({ ...current, [key]: value }))
  const submit: FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)
    try {
      await props.onCreate(draft)
      props.onClose()
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'The user could not be created. Please try again.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }
  return (
    <div className="modal-backdrop" onMouseDown={props.onClose}>
      <section
        className="modal-card modal-card--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-user-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <CloseButton label="Close create user modal" onClick={props.onClose} />
        <header className="modal-header">
          <span className="modal-eyebrow">USER MANAGEMENT</span>
          <h2 id="create-user-title">Create user account</h2>
          <p className="modal-description">
            A sign-in account and its Agrisell profile will be created. Farmer accounts also receive
            a linked farmer profile.
          </p>
        </header>
        <form onSubmit={submit}>
          <CreateUserFields draft={draft} update={update} />
          <CreateFarmerFields draft={draft} update={update} />
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <button
              type="button"
              className="outline-button"
              onClick={props.onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button className="primary-button" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create account'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
