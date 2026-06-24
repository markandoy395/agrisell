type SettingsWorkspaceProps = {
  autoApprove: boolean
  digest: boolean
  onToggleApprove: () => void
  onToggleDigest: () => void
  onSave: () => void
  onReset: () => void
}

export function SettingsWorkspace({ autoApprove, digest, onToggleApprove, onToggleDigest, onSave, onReset }: SettingsWorkspaceProps) {
  return <section className="settings-workspace panel"><div className="panel-heading"><div><h2>Workspace settings</h2><p>Control how Agrisell handles marketplace activity.</p></div></div>
    <div className="settings-list"><div><div><strong>Auto-approve verified farmer listings</strong><span>Publish commodities from verified farms immediately.</span></div><button className={`switch ${autoApprove ? 'checked' : ''}`} onClick={onToggleApprove} aria-pressed={autoApprove}><i /></button></div><div><div><strong>Daily admin digest</strong><span>Receive a daily summary of sales, orders, and delivery exceptions.</span></div><button className={`switch ${digest ? 'checked' : ''}`} onClick={onToggleDigest} aria-pressed={digest}><i /></button></div></div>
    <div className="settings-actions"><button className="outline-button" onClick={onReset}>Reset</button><button className="primary-button" onClick={onSave}>Save preferences</button></div>
  </section>
}
