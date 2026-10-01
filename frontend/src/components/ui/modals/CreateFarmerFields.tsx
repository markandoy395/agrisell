import type { CreateUserInput } from '../../../api/adminData'

type CreateFarmerFieldsProps = {
  draft: CreateUserInput
  update: <K extends keyof CreateUserInput>(key: K, value: CreateUserInput[K]) => void
}

export function CreateFarmerFields({ draft, update }: CreateFarmerFieldsProps) {
  if (draft.accountType !== 'farmer') return null
  return (
    <fieldset className="create-user-farmer-fields">
      <legend>Farmer profile</legend>
      <div className="create-user-fields">
        <label className="field-label field-label--full">
          Address line
          <input
            value={draft.addressLine ?? ''}
            onChange={(event) => update('addressLine', event.target.value)}
          />
        </label>
        <label className="field-label">
          Barangay
          <input
            value={draft.barangay ?? ''}
            onChange={(event) => update('barangay', event.target.value)}
          />
        </label>
        <label className="field-label">
          City or municipality
          <input
            value={draft.cityMunicipality ?? ''}
            onChange={(event) => update('cityMunicipality', event.target.value)}
          />
        </label>
        <label className="field-label">
          Province
          <input
            value={draft.province ?? ''}
            onChange={(event) => update('province', event.target.value)}
          />
        </label>
        <label className="field-label">
          Postal code
          <input
            value={draft.postalCode ?? ''}
            onChange={(event) => update('postalCode', event.target.value)}
          />
        </label>
        <label className="field-label">
          Certification
          <input
            placeholder="Optional"
            value={draft.certification ?? ''}
            onChange={(event) => update('certification', event.target.value)}
          />
        </label>
        <label className="field-label">
          Years of experience
          <input
            type="number"
            min="0"
            max="120"
            value={draft.yearsOfExperience ?? ''}
            onChange={(event) => update('yearsOfExperience', event.target.value)}
          />
        </label>
        <label className="field-label">
          Verification status
          <select
            value={draft.verificationStatus ?? 'pending'}
            onChange={(event) =>
              update('verificationStatus', event.target.value as 'pending' | 'verified')
            }
          >
            <option value="pending">Pending</option>
            <option value="verified">Verified</option>
          </select>
        </label>
        <label className="field-label field-label--full">
          Payout details
          <input
            placeholder="Optional bank or e-wallet details"
            value={draft.bankDetails ?? ''}
            onChange={(event) => update('bankDetails', event.target.value)}
          />
        </label>
      </div>
    </fieldset>
  )
}
