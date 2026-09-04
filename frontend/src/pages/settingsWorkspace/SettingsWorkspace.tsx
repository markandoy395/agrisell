import { useState } from "react";
import type { FormEvent } from "react";
import type { CreateAdministratorInput } from "../../api/adminData";
import type { AdministratorRecord } from "../../types/adminData";
import { getApiErrorMessage } from "../../api/adminAuth";
import { CloseButton } from "../../components/ui/closeButton/CloseButton";
import { Icon } from "../../components/ui/icon/Icon";
import "../../components/ui/modals/DashboardModals.css";
import "./SettingsWorkspace.css";

const privileges = [
  { key: "overview:view", label: "Overview", description: "View marketplace summaries and activity." },
  { key: "users:manage", label: "Users", description: "Create and manage user accounts." },
  { key: "farmers:manage", label: "Farmers", description: "Review and approve farmer accounts." },
  { key: "logistics:manage", label: "Logistics", description: "Manage riders, deliveries, and logistics companies." },
  { key: "orders:manage", label: "Orders", description: "View and manage marketplace orders." },
  { key: "payments:view", label: "Payments", description: "View payment and settlement information." },
  { key: "sales:manage", label: "Sales & discounts", description: "Create and manage promotional campaigns." },
  { key: "reviews:manage", label: "Reviews", description: "View and moderate customer reviews." },
  { key: "settings:manage", label: "Settings", description: "Change regular workspace preferences." },
] as const;

const defaultAdminPrivileges = ["overview:view", "users:manage", "farmers:manage"];

type SettingsWorkspaceProps = {
  administrators: AdministratorRecord[];
  autoApprove: boolean;
  canManageAdmins: boolean;
  digest: boolean;
  onCreateAdministrator: (input: CreateAdministratorInput) => Promise<void>;
  onToggleApprove: () => void;
  onToggleDigest: () => void;
  onUpdateAdministratorPrivileges: (userId: string, permissions: string[]) => Promise<void>;
  onSave: () => void;
  onReset: () => void;
};

const emptyForm: CreateAdministratorInput = {
  email: "", firstName: "", lastName: "", password: "", permissions: defaultAdminPrivileges,
};

export function SettingsWorkspace({ administrators, autoApprove, canManageAdmins, digest, onCreateAdministrator, onToggleApprove, onToggleDigest, onUpdateAdministratorPrivileges, onSave, onReset }: SettingsWorkspaceProps) {
  const [form, setForm] = useState<CreateAdministratorInput>(emptyForm);
  const [error, setError] = useState("");
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState<AdministratorRecord | null>(null);
  const [editPermissions, setEditPermissions] = useState<string[]>([]);
  const [editError, setEditError] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);

  const closeAdminModal = () => {
    if (isSubmitting) return;
    setError("");
    setForm(emptyForm);
    setShowPassword(false);
    setIsAdminModalOpen(false);
  };

  const submitAdministrator = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (!form.permissions.length) {
      setError("Select at least one privilege for the new administrator.");
      return;
    }
    setIsSubmitting(true);
    try {
      await onCreateAdministrator(form);
      setForm(emptyForm);
      setShowPassword(false);
      setIsAdminModalOpen(false);
    } catch (creationError) {
      setError(getApiErrorMessage(creationError, "The administrator could not be created."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const togglePrivilege = (permission: string) => setForm((current) => ({
    ...current,
    permissions: current.permissions.includes(permission)
      ? current.permissions.filter((item) => item !== permission)
      : [...current.permissions, permission],
  }));

  const openPrivilegeEditor = (administrator: AdministratorRecord) => {
    setEditingAdmin(administrator);
    setEditPermissions(administrator.permissions);
    setEditError("");
  };

  const closePrivilegeEditor = () => {
    if (isUpdating) return;
    setEditingAdmin(null);
    setEditPermissions([]);
    setEditError("");
  };

  const toggleEditPrivilege = (permission: string) => setEditPermissions((current) =>
    current.includes(permission)
      ? current.filter((item) => item !== permission)
      : [...current, permission],
  );

  const submitPrivilegeUpdate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingAdmin || !editPermissions.length) {
      setEditError("Select at least one privilege for this administrator.");
      return;
    }
    setEditError("");
    setIsUpdating(true);
    try {
      await onUpdateAdministratorPrivileges(editingAdmin.userId, editPermissions);
      setEditingAdmin(null);
      setEditPermissions([]);
      setEditError("");
    } catch (updateError) {
      setEditError(getApiErrorMessage(updateError, "The administrator privileges could not be updated."));
    } finally {
      setIsUpdating(false);
    }
  };

  return <div className="settings-sections">
    <section className="settings-workspace panel"><div className="panel-heading"><div><h2>Workspace settings</h2><p>Control how Agrisell handles marketplace activity.</p></div>{canManageAdmins && <button type="button" className="primary-button settings-admin-button" onClick={() => setIsAdminModalOpen(true)}>Create administrator</button>}</div>
      <div className="settings-list"><div><div><strong>Auto-approve verified farmer listings</strong><span>Publish commodities from verified farms immediately.</span></div><button type="button" className={`switch ${autoApprove ? "checked" : ""}`} onClick={onToggleApprove} aria-pressed={autoApprove}><i /></button></div><div><div><strong>Daily admin digest</strong><span>Receive a daily summary of sales, orders, and delivery exceptions.</span></div><button type="button" className={`switch ${digest ? "checked" : ""}`} onClick={onToggleDigest} aria-pressed={digest}><i /></button></div></div>
      <div className="settings-actions"><button type="button" className="outline-button" onClick={onReset}>Reset</button><button type="button" className="primary-button" onClick={onSave}>Save preferences</button></div>
    </section>
    {canManageAdmins && <section className="settings-workspace settings-admin-management panel">
      <div className="panel-heading"><div><h2>Administrator privileges</h2><p>Review administrator access and update the privileges assigned to regular admins.</p></div></div>
      <div className="administrator-list">
        {administrators.map((administrator) => <article className="administrator-row" key={administrator.userId}>
          <div className="administrator-identity"><strong>{administrator.name}</strong><span>{administrator.email}</span><small>{administrator.role === "super_admin" ? "Superadmin · Full system access" : `Admin · ${administrator.permissions.length} privileges`}</small></div>
          <div className="administrator-privileges">{administrator.permissions.map((permission) => <span key={permission}>{privileges.find((item) => item.key === permission)?.label ?? (permission === "admin:manage" ? "Administrator management" : permission)}</span>)}</div>
          {administrator.role === "admin" && <button type="button" className="icon-action-button" onClick={() => openPrivilegeEditor(administrator)} aria-label={`Edit privileges for ${administrator.name}`} title="Edit privileges"><Icon name="edit" size={17} /></button>}
        </article>)}
        {!administrators.length && <p className="administrator-empty">No administrator accounts were found.</p>}
      </div>
    </section>}
    {canManageAdmins && isAdminModalOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeAdminModal(); }}>
      <section className="modal-card modal-card--wide admin-creation-modal" role="dialog" aria-modal="true" aria-labelledby="create-admin-title">
        <CloseButton label="Close create administrator form" onClick={closeAdminModal} disabled={isSubmitting} />
        <header className="modal-header"><span className="modal-eyebrow">SUPERADMIN ONLY</span><h2 id="create-admin-title">Create administrator</h2><p className="modal-description">Create a sign-in account and choose exactly which dashboard areas it can access.</p></header>
        <form className="admin-creation-form" onSubmit={submitAdministrator}>
        <div className="admin-fields">
          <label>First name<input required maxLength={100} value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} /></label>
          <label>Last name<input required maxLength={100} value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} /></label>
          <label>Email address<input required type="email" autoComplete="off" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
          <label>Temporary password<span className="admin-password-field"><input required minLength={8} type={showPassword ? "text" : "password"} autoComplete="new-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /><button type="button" onClick={() => setShowPassword((isVisible) => !isVisible)} aria-label={showPassword ? "Hide temporary password" : "Show temporary password"} aria-pressed={showPassword}><Icon name={showPassword ? "eyeOff" : "eye"} size={17} /></button></span></label>
        </div>
        <fieldset className="privilege-fieldset"><legend>Administrator privileges</legend><div className="privilege-selection-summary"><p>Select one or more. The new administrator cannot create other admins.</p><button type="button" onClick={() => setForm((current) => ({ ...current, permissions: privileges.map((privilege) => privilege.key) }))}>Select all</button></div>
          <div className="privilege-grid">{privileges.map((privilege) => <label className="privilege-option" key={privilege.key}><input type="checkbox" checked={form.permissions.includes(privilege.key)} onChange={() => togglePrivilege(privilege.key)} /><span><strong>{privilege.label}</strong><small>{privilege.description}</small></span></label>)}</div>
        </fieldset>
        {error && <p className="admin-form-error" role="alert">{error}</p>}
          <div className="modal-actions"><button type="button" className="outline-button" disabled={isSubmitting} onClick={closeAdminModal}>Cancel</button><button className="primary-button" disabled={isSubmitting} type="submit">{isSubmitting ? "Creating administrator..." : "Create administrator"}</button></div>
        </form>
      </section>
    </div>}
    {canManageAdmins && editingAdmin && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closePrivilegeEditor(); }}>
      <section className="modal-card modal-card--wide admin-creation-modal" role="dialog" aria-modal="true" aria-labelledby="edit-admin-privileges-title">
        <CloseButton label="Close privilege editor" onClick={closePrivilegeEditor} disabled={isUpdating} />
        <header className="modal-header"><span className="modal-eyebrow">SUPERADMIN ONLY</span><h2 id="edit-admin-privileges-title">Update administrator privileges</h2><p className="modal-description">Choose the dashboard areas that {editingAdmin.name} can access.</p></header>
        <form className="admin-creation-form" onSubmit={submitPrivilegeUpdate}>
          <fieldset className="privilege-fieldset"><legend>Administrator privileges</legend><div className="privilege-selection-summary"><p>{editPermissions.length} selected</p><button type="button" onClick={() => setEditPermissions(privileges.map((privilege) => privilege.key))}>Select all</button></div>
            <div className="privilege-grid">{privileges.map((privilege) => <label className="privilege-option" key={privilege.key}><input type="checkbox" checked={editPermissions.includes(privilege.key)} onChange={() => toggleEditPrivilege(privilege.key)} /><span><strong>{privilege.label}</strong><small>{privilege.description}</small></span></label>)}</div>
          </fieldset>
          {editError && <p className="admin-form-error" role="alert">{editError}</p>}
          <div className="modal-actions"><button type="button" className="outline-button" disabled={isUpdating} onClick={closePrivilegeEditor}>Cancel</button><button className="primary-button" disabled={isUpdating} type="submit">{isUpdating ? "Updating privileges..." : "Save privileges"}</button></div>
        </form>
      </section>
    </div>}
  </div>;
}
