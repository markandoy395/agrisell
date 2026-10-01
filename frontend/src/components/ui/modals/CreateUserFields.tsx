import type { CreateUserInput } from '../../../api/adminData'

type CreateUserFieldsProps = {
  draft: CreateUserInput
  update: <K extends keyof CreateUserInput>(key: K, value: CreateUserInput[K]) => void
}

export function CreateUserFields({ draft, update }: CreateUserFieldsProps) {
  return (
    <div className="create-user-fields">
      <label className="field-label">
        Account type
        <select
          value={draft.accountType}
          onChange={(event) =>
            update('accountType', event.target.value as CreateUserInput['accountType'])
          }
        >
          <option value="user">Regular user</option>
          <option value="farmer">Farmer</option>
        </select>
      </label>
      <label className="field-label">
        Email address
        <input
          autoFocus
          type="email"
          value={draft.email}
          onChange={(event) => update('email', event.target.value)}
          required
        />
      </label>
      <label className="field-label">
        Temporary password
        <input
          type="password"
          minLength={8}
          value={draft.password}
          onChange={(event) => update('password', event.target.value)}
          required
        />
      </label>
      <label className="field-label">
        Contact number
        <input
          type="tel"
          value={draft.contactNumber ?? ''}
          onChange={(event) => update('contactNumber', event.target.value)}
        />
      </label>
      <label className="field-label">
        First name
        <input
          value={draft.firstName}
          onChange={(event) => update('firstName', event.target.value)}
          required
        />
      </label>
      <label className="field-label">
        Middle name
        <input
          value={draft.middleName ?? ''}
          onChange={(event) => update('middleName', event.target.value)}
        />
      </label>
      <label className="field-label">
        Last name
        <input
          value={draft.lastName}
          onChange={(event) => update('lastName', event.target.value)}
          required
        />
      </label>
      <label className="field-label">
        Extension name
        <input
          placeholder="Jr., Sr., III"
          value={draft.extensionName ?? ''}
          onChange={(event) => update('extensionName', event.target.value)}
        />
      </label>
      <label className="field-label">
        Gender
        <select
          value={draft.gender ?? ''}
          onChange={(event) => update('gender', event.target.value)}
        >
          <option value="">Not specified</option>
          <option value="female">Female</option>
          <option value="male">Male</option>
          <option value="prefer_not_to_say">Prefer not to say</option>
        </select>
      </label>
      <label className="field-label">
        Date of birth
        <input
          type="date"
          value={draft.dateOfBirth ?? ''}
          onChange={(event) => update('dateOfBirth', event.target.value)}
        />
      </label>
      <label className="field-label field-label--full">
        E-wallet details
        <input
          placeholder="Optional account name or number"
          value={draft.eWalletDetails ?? ''}
          onChange={(event) => update('eWalletDetails', event.target.value)}
        />
      </label>
    </div>
  )
}
