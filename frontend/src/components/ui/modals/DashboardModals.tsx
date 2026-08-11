import type { ChangeEvent, FormEventHandler } from "react";
import { useState } from "react";
import { entityInfo } from "../../../data/dashboardMock";
import type { CreateUserInput } from "../../../api/adminData";
import type { AdminProfile, DashboardModal } from "../../../types/dashboard";
import { CloseButton } from "../closeButton/CloseButton";
import "./DashboardModals.css";

type DetailsModalProps = { modal: DashboardModal; onClose: () => void };

export function DetailsModal({ modal, onClose }: DetailsModalProps) {
  if (!modal) return null;
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
  );
}

type AddRecordModalProps = {
  section: string | null;
  name: string;
  onNameChange: (value: string) => void;
  onClose: () => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
};

export function AddRecordModal({
  section,
  name,
  onNameChange,
  onClose,
  onSubmit,
}: AddRecordModalProps) {
  if (!section) return null;
  const info = entityInfo[section];
  return (
    <div className="modal-backdrop">
      <section
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-title"
      >
        <CloseButton
          label={`Close add ${info.singular} modal`}
          onClick={onClose}
        />
        <header className="modal-header">
          <span className="modal-eyebrow">
            NEW {section.slice(0, -1).toUpperCase()}
          </span>
          <h2 id="add-title">Add a {info.singular}</h2>
        </header>
        <form onSubmit={onSubmit}>
          <label className="field-label">
            Name or reference
            <input
              autoFocus
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              placeholder={`Enter ${info.singular} name`}
              required
            />
          </label>
          <div className="modal-actions">
            <button type="button" className="outline-button" onClick={onClose}>
              Cancel
            </button>
            <button className="primary-button" type="submit">
              Create record
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

type CreateUserModalProps = {
  defaultAccountType: CreateUserInput["accountType"];
  onClose: () => void;
  onCreate: (input: CreateUserInput) => Promise<void>;
};

const emptyUserInput = (accountType: CreateUserInput["accountType"]): CreateUserInput => ({
  accountType,
  email: "",
  firstName: "",
  lastName: "",
  password: "",
  verificationStatus: "pending",
});

export function CreateUserModal({
  defaultAccountType,
  onClose,
  onCreate,
}: CreateUserModalProps) {
  const [draft, setDraft] = useState<CreateUserInput>(() =>
    emptyUserInput(defaultAccountType),
  );
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isFarmer = draft.accountType === "farmer";

  const update = <K extends keyof CreateUserInput>(key: K, value: CreateUserInput[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const submit: FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      await onCreate(draft);
      onClose();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The user could not be created. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        className="modal-card modal-card--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-user-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <CloseButton label="Close create user modal" onClick={onClose} />
        <header className="modal-header">
          <span className="modal-eyebrow">USER MANAGEMENT</span>
          <h2 id="create-user-title">Create user account</h2>
          <p className="modal-description">A sign-in account and its Agrisell profile will be created. Farmer accounts also receive a linked farmer profile.</p>
        </header>
        <form onSubmit={submit}>
          <div className="create-user-fields">
            <label className="field-label">
              Account type
              <select value={draft.accountType} onChange={(event) => update("accountType", event.target.value as CreateUserInput["accountType"])}>
                <option value="user">Regular user</option>
                <option value="farmer">Farmer</option>
              </select>
            </label>
            <label className="field-label">
              Email address
              <input autoFocus type="email" value={draft.email} onChange={(event) => update("email", event.target.value)} required />
            </label>
            <label className="field-label">
              Temporary password
              <input type="password" minLength={8} value={draft.password} onChange={(event) => update("password", event.target.value)} required />
            </label>
            <label className="field-label">
              Contact number
              <input type="tel" value={draft.contactNumber ?? ""} onChange={(event) => update("contactNumber", event.target.value)} />
            </label>
            <label className="field-label">
              First name
              <input value={draft.firstName} onChange={(event) => update("firstName", event.target.value)} required />
            </label>
            <label className="field-label">
              Middle name
              <input value={draft.middleName ?? ""} onChange={(event) => update("middleName", event.target.value)} />
            </label>
            <label className="field-label">
              Last name
              <input value={draft.lastName} onChange={(event) => update("lastName", event.target.value)} required />
            </label>
            <label className="field-label">
              Extension name
              <input placeholder="Jr., Sr., III" value={draft.extensionName ?? ""} onChange={(event) => update("extensionName", event.target.value)} />
            </label>
            <label className="field-label">
              Gender
              <select value={draft.gender ?? ""} onChange={(event) => update("gender", event.target.value)}>
                <option value="">Not specified</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="prefer_not_to_say">Prefer not to say</option>
              </select>
            </label>
            <label className="field-label">
              Date of birth
              <input type="date" value={draft.dateOfBirth ?? ""} onChange={(event) => update("dateOfBirth", event.target.value)} />
            </label>
            <label className="field-label field-label--full">
              E-wallet details
              <input placeholder="Optional account name or number" value={draft.eWalletDetails ?? ""} onChange={(event) => update("eWalletDetails", event.target.value)} />
            </label>
          </div>

          {isFarmer && (
            <fieldset className="create-user-farmer-fields">
              <legend>Farmer profile</legend>
              <div className="create-user-fields">
                <label className="field-label field-label--full">
                  Address line
                  <input value={draft.addressLine ?? ""} onChange={(event) => update("addressLine", event.target.value)} />
                </label>
                <label className="field-label">
                  Barangay
                  <input value={draft.barangay ?? ""} onChange={(event) => update("barangay", event.target.value)} />
                </label>
                <label className="field-label">
                  City or municipality
                  <input value={draft.cityMunicipality ?? ""} onChange={(event) => update("cityMunicipality", event.target.value)} />
                </label>
                <label className="field-label">
                  Province
                  <input value={draft.province ?? ""} onChange={(event) => update("province", event.target.value)} />
                </label>
                <label className="field-label">
                  Postal code
                  <input value={draft.postalCode ?? ""} onChange={(event) => update("postalCode", event.target.value)} />
                </label>
                <label className="field-label">
                  Certification
                  <input placeholder="Optional" value={draft.certification ?? ""} onChange={(event) => update("certification", event.target.value)} />
                </label>
                <label className="field-label">
                  Years of experience
                  <input type="number" min="0" max="120" value={draft.yearsOfExperience ?? ""} onChange={(event) => update("yearsOfExperience", event.target.value)} />
                </label>
                <label className="field-label">
                  Verification status
                  <select value={draft.verificationStatus ?? "pending"} onChange={(event) => update("verificationStatus", event.target.value as "pending" | "verified")}>
                    <option value="pending">Pending</option>
                    <option value="verified">Verified</option>
                  </select>
                </label>
                <label className="field-label field-label--full">
                  Payout details
                  <input placeholder="Optional bank or e-wallet details" value={draft.bankDetails ?? ""} onChange={(event) => update("bankDetails", event.target.value)} />
                </label>
              </div>
            </fieldset>
          )}
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="outline-button" onClick={onClose} disabled={isSubmitting}>Cancel</button>
            <button className="primary-button" type="submit" disabled={isSubmitting}>{isSubmitting ? "Creating..." : "Create account"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}

type ProfileModalProps = {
  profile: AdminProfile;
  onClose: () => void;
  onSave: (profile: AdminProfile) => void;
};

export function ProfileModal({ profile, onClose, onSave }: ProfileModalProps) {
  const [draft, setDraft] = useState(profile);

  const updatePhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const photo = event.target.files?.[0];
    if (!photo) return;

    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const avatarUrl = reader.result;
      if (typeof avatarUrl !== "string") return;
      setDraft((current) => ({ ...current, avatarUrl }));
    });
    reader.readAsDataURL(photo);
  };

  const saveProfile: FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    const name = draft.name.trim();
    const email = draft.email.trim();
    const role = draft.role.trim();
    if (!name || !email || !role) return;
    onSave({ ...draft, name, email, role });
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <CloseButton label="Close profile modal" onClick={onClose} />
        <header className="modal-header">
          <span className="modal-eyebrow">ADMIN PROFILE</span>
          <h2 id="profile-title">Profile information</h2>
        </header>
        <div className="profile-editor-summary">
          <span
            className={`profile-editor-avatar${draft.avatarUrl ? " has-photo" : ""}`}
          >
            {draft.avatarUrl ? (
              <img src={draft.avatarUrl} alt="" />
            ) : (
              draft.initials
            )}
          </span>
          <div>
            <strong>{draft.name || "Administrator"}</strong>
            <span>{draft.email || "Add an email address"}</span>
          </div>
        </div>
        <form onSubmit={saveProfile}>
          <div className="profile-fields">
            <label className="profile-photo-field">
              <span>
                Profile photo<small>JPG, PNG, or WEBP</small>
              </span>
              <span className="profile-photo-upload">
                {draft.avatarUrl ? "Change image" : "Add image"}
                <input type="file" accept="image/*" onChange={updatePhoto} />
              </span>
            </label>
            <label className="field-label">
              Full name
              <input
                autoFocus
                value={draft.name}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                required
              />
            </label>
            <label className="field-label">
              Email address
              <input
                type="email"
                value={draft.email}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    email: event.target.value,
                  }))
                }
                required
              />
            </label>
            <label className="field-label">
              Role
              <input
                value={draft.role}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    role: event.target.value,
                  }))
                }
                required
              />
            </label>
          </div>
          <div className="modal-actions">
            <button type="button" className="outline-button" onClick={onClose}>
              Cancel
            </button>
            <button className="primary-button" type="submit">
              Save changes
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
