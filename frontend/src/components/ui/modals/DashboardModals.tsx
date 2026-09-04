import type { ChangeEvent, FormEventHandler } from "react";
import { useState } from "react";
import { getEntityInfo } from "../../../data/entityWorkspaceConfig";
import type { CreateUserInput } from "../../../api/adminData";
import type { AdminProfile, DashboardModal, IconName } from "../../../types/dashboard";
import { CloseButton } from "../closeButton/CloseButton";
import { Icon } from "../icon/Icon";
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
  const info = getEntityInfo(section);
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
  permissions: string[];
  profile: AdminProfile;
  onClose: () => void;
  onSave: (profile: AdminProfile) => Promise<void>;
};

const PROFILE_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_PROFILE_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_PROFILE_IMAGE_DATA_LENGTH = 650_000;

const resizeProfilePhoto = (photo: File) =>
  new Promise<string>((resolve, reject) => {
    if (!PROFILE_IMAGE_TYPES.has(photo.type)) {
      reject(new Error("Choose a JPG, PNG, or WEBP image."));
      return;
    }
    if (photo.size > MAX_PROFILE_IMAGE_BYTES) {
      reject(new Error("Profile images must be 5 MB or smaller."));
      return;
    }

    const reader = new FileReader();
    reader.addEventListener("error", () => reject(new Error("The selected image could not be read.")));
    reader.addEventListener("load", () => {
      if (typeof reader.result !== "string") {
        reject(new Error("The selected image could not be read."));
        return;
      }
      const image = new Image();
      image.addEventListener("error", () => reject(new Error("The selected file is not a valid image.")));
      image.addEventListener("load", () => {
        const scale = Math.min(1, 512 / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("The image could not be prepared for upload."));
          return;
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const avatarUrl = canvas.toDataURL("image/webp", 0.82);
        if (avatarUrl.length > MAX_PROFILE_IMAGE_DATA_LENGTH) {
          reject(new Error("The processed profile image is still too large."));
          return;
        }
        resolve(avatarUrl);
      });
      image.src = reader.result;
    });
    reader.readAsDataURL(photo);
  });

const permissionDetails: Record<string, { label: string; description: string; icon: IconName }> = {
  "overview:view": { label: "Overview", description: "Dashboard & reports", icon: "home" },
  "users:manage": { label: "Users", description: "Manage user accounts", icon: "users" },
  "farmers:manage": { label: "Farmers", description: "Manage farmer records", icon: "sprout" },
  "logistics:manage": { label: "Logistics & Deliveries", description: "Manage deliveries", icon: "truck" },
  "orders:manage": { label: "Orders", description: "View and manage orders", icon: "cart" },
  "payments:view": { label: "Payments", description: "Track transactions", icon: "card" },
  "sales:manage": { label: "Sales & Discounts", description: "Manage promotions", icon: "trend" },
  "reviews:manage": { label: "Reviews", description: "Customer feedback", icon: "star" },
  "settings:manage": { label: "Settings", description: "System configuration", icon: "settings" },
  "admin:manage": { label: "Administrator Management", description: "Manage system administrators", icon: "shield" },
};

export function ProfileModal({ permissions, profile, onClose, onSave }: ProfileModalProps) {
  const [draft, setDraft] = useState(profile);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const hasFullAccess = permissions.includes("admin:manage");

  const updatePhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const photo = event.target.files?.[0];
    if (!photo) return;
    setError("");
    try {
      const avatarUrl = await resizeProfilePhoto(photo);
      setDraft((current) => ({ ...current, avatarUrl }));
    } catch (photoError) {
      setError(photoError instanceof Error ? photoError.message : "The profile image could not be prepared.");
    } finally {
      event.target.value = "";
    }
  };

  const saveProfile: FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    const name = draft.name.trim();
    const email = draft.email.trim();
    const role = draft.role.trim();
    if (!name || !email || !role) return;
    setError("");
    setIsSaving(true);
    void onSave({ ...draft, name, email, role })
      .catch((saveError) => {
        setError(saveError instanceof Error ? saveError.message : "The profile could not be saved.");
      })
      .finally(() => setIsSaving(false));
  };

  return (
    <div className="modal-backdrop profile-modal-backdrop" onMouseDown={onClose}>
      <section
        className="modal-card profile-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <CloseButton label="Close profile modal" onClick={onClose} />
        <header className="profile-modal-header">
          <span className="profile-header-icon"><Icon name="profile" size={23} /></span>
          <div>
            <span className="profile-modal-eyebrow">ADMIN PROFILE</span>
            <h2 id="profile-title">Profile Information</h2>
            <p>View and manage your account details and privileges.</p>
          </div>
        </header>
        <section className="profile-hero" aria-label="Profile summary">
          <label className={`profile-hero-avatar${draft.avatarUrl ? " has-photo" : ""}`} title="Change profile photo">
            {draft.avatarUrl ? <img src={draft.avatarUrl} alt="" /> : draft.initials}
            <span className="profile-camera"><Icon name="camera" size={18} /></span>
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { void updatePhoto(event); }} disabled={isSaving} />
          </label>
          <div className="profile-hero-main">
            <strong>{draft.name || "Administrator"}</strong>
            <span>{draft.email || "Add an email address"}</span>
            <div className="profile-statuses">
              <span><Icon name="shield" size={16} />{hasFullAccess ? "Super Administrator" : "Administrator"}</span>
              <span><i />Active</span>
            </div>
          </div>
          <blockquote>“Manage today<br />for a better tomorrow.”<Icon name="leaf" size={21} /></blockquote>
        </section>
        <section className="profile-details-card">
          <div className="profile-section-heading">
            <span className="profile-section-icon"><Icon name="grid" size={22} /></span>
            <div>
              <strong id="profile-access-title">Account Privileges</strong>
              <span>Modules and features you can access.</span>
            </div>
            <span className="profile-full-access">
              <Icon name="crown" size={19} />{hasFullAccess ? "FULL ACCESS" : `${permissions.length} PRIVILEGES`}
            </span>
          </div>
          <div className="profile-access-list" role="list">
            {permissions.map((permission) => {
              const detail = permissionDetails[permission];
              if (!detail) return null;
              return <div className="profile-privilege" key={permission} role="listitem">
                <Icon name={detail.icon} size={27} />
                <span><strong>{detail.label}</strong><small>{detail.description}</small></span>
              </div>;
            })}
          </div>
          <form id="profile-information-form" className="profile-information-form" onSubmit={saveProfile}>
            <div className="profile-section-heading profile-personal-heading">
              <span className="profile-section-icon"><Icon name="profile" size={22} /></span>
              <div><strong>Personal Information</strong><span>Update your account details below.</span></div>
            </div>
          <div className="profile-fields">
            <label className="field-label">
              Full name
              <span className="profile-input"><Icon name="profile" size={20} /><input autoFocus value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} required /></span>
            </label>
            <label className="field-label">
              Email address
              <span className="profile-input"><Icon name="mail" size={20} /><input type="email" value={draft.email} readOnly required /></span>
            </label>
            <label className="field-label">
              Role
              <span className="profile-input"><Icon name="shield" size={20} /><input value={draft.role} readOnly required /><Icon name="chevron" size={17} /></span>
            </label>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          </form>
        </section>
          <div className="modal-actions profile-modal-actions">
            <button type="button" className="outline-button" onClick={onClose} disabled={isSaving}>
              Cancel
            </button>
            <button className="primary-button" type="submit" form="profile-information-form" disabled={isSaving}>
              <Icon name="save" size={18} />{isSaving ? "Saving..." : "Save Changes"}
            </button>
          </div>
      </section>
    </div>
  );
}
