import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { OverviewDashboard } from './pages/OverviewDashboard'
import { DashboardSidebar } from './components/layout/DashboardSidebar'
import { DashboardTopbar } from './components/layout/DashboardTopbar'
import { AddRecordModal, DetailsModal } from './components/ui/modals/DashboardModals'
import { EntityWorkspace } from './pages/EntityWorkspace'
import { Icon } from './components/ui/Icon'
import { SettingsWorkspace } from './pages/SettingsWorkspace'
import { chartPoints, orderRows } from './data/dashboardMock'
import type { EntityRecord, Modal, OrderRow } from './types/dashboard'
import './App.css'

const mobileUserAgentPattern = /Android|BlackBerry|IEMobile|iPhone|iPad|iPod|Opera Mini|webOS|Windows Phone/i

function App() {
  const isMobileDevice = mobileUserAgentPattern.test(navigator.userAgent)
  const [activeNav, setActiveNav] = useState('Overview')
  const [period, setPeriod] = useState('This month')
  const [search, setSearch] = useState('')
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [hasNotifications, setHasNotifications] = useState(true)
  const [periodOpen, setPeriodOpen] = useState(false)
  const [metricOpen, setMetricOpen] = useState(false)
  const [metric, setMetric] = useState('Revenue')
  const [chartHover, setChartHover] = useState<number | null>(4)
  const [panelMenu, setPanelMenu] = useState<'commodity' | 'delivery' | null>(null)
  const [profileOpen, setProfileOpen] = useState(false)
  const [activeOnly, setActiveOnly] = useState(false)
  const [modal, setModal] = useState<Modal>(null)
  const [addSection, setAddSection] = useState<string | null>(null)
  const [newRecordName, setNewRecordName] = useState('')
  const [created, setCreated] = useState<Record<string, EntityRecord[]>>({})
  const [toast, setToast] = useState('')
  const [autoApprove, setAutoApprove] = useState(true)
  const [digest, setDigest] = useState(true)

  const visibleOrders = useMemo(() => {
    const query = search.toLowerCase().trim()
    return query ? orderRows.filter((order) => `${order.id} ${order.customer} ${order.item}`.toLowerCase().includes(query)) : orderRows
  }, [search])

  const showToast = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 2600)
  }

  const navigate = (section: string) => {
    setActiveNav(section)
    setActiveOnly(false)
    setPanelMenu(null)
    setPeriodOpen(false)
    setMetricOpen(false)
  }

  const createRecord = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!addSection || !newRecordName.trim()) return
    const record = { primary: newRecordName.trim(), secondary: 'Created just now', category: 'New record', value: 'Not set', status: 'Active', tone: 'green' }
    setCreated((current) => ({ ...current, [addSection]: [record, ...(current[addSection] ?? [])] }))
    setAddSection(null)
    setNewRecordName('')
    showToast(`${newRecordName.trim()} was added to ${addSection}.`)
  }

  const openRecord = (record: EntityRecord) => setModal({ title: record.primary, message: `${record.secondary}\n\n${record.category}\n${record.value}\n\nCurrent status: ${record.status}` })
  const openOrder = (order: OrderRow) => setModal({ title: `Order ${order.id}`, message: `${order.customer}\n\n${order.item} - ${order.qty}\nTotal: ${order.total}\n\nCurrent status: ${order.status}` })
  const updateChartTooltip = (clientX: number, element: HTMLDivElement) => {
    const bounds = element.getBoundingClientRect()
    const progress = Math.min(1, Math.max(0, (clientX - bounds.left) / bounds.width))
    setChartHover(Math.round(progress * (chartPoints.length - 1)))
  }

  const pageTitle = activeNav === 'Overview' ? "Here's what's growing today." : activeNav
  const pageDescription = activeNav === 'Overview' ? 'A live look at your marketplace, farms, and fulfilment.' : activeNav === 'Settings' ? 'Fine-tune the way your admin workspace works.' : `Monitor and manage your ${activeNav.toLowerCase()} in one place.`
  const activeChartPoint = chartHover === null ? null : chartPoints[chartHover]
  const tooltipPlacement = chartHover !== null && chartHover >= 3 ? ' tooltip-below' : ''

  return <div className={isMobileDevice ? 'mobile-device' : undefined}>
    <section className="mobile-access-notice" aria-labelledby="mobile-access-title">
      <div className="mobile-access-card">
        <div className="mobile-access-brand" role="img" aria-label="Agrisell"><span className="brand-mark" aria-hidden="true" /></div>
        <p className="mobile-access-eyebrow">ADMIN WORKSPACE</p>
        <h1 id="mobile-access-title">Desktop access required</h1>
        <p>Agrisell Admin is available on desktop and laptop devices only. Please switch to a larger device to continue.</p>
      </div>
    </section>
    <div className="dashboard">
      <DashboardSidebar activeNav={activeNav} profileOpen={profileOpen} onNavigate={navigate} onToggleProfile={() => setProfileOpen(!profileOpen)} onOpenHelp={() => setModal({ title: 'Agrisell help center', message: 'Need a hand? Our support team can help with marketplace operations, seller verification, and delivery issues.' })} onOpenPreferences={() => { navigate('Settings'); setProfileOpen(false) }} onSignOut={() => { setProfileOpen(false); showToast('Signed out successfully.') }}/>
      <main className="main-content">
        <DashboardTopbar activeNav={activeNav} search={search} notificationsOpen={notificationsOpen} hasNotifications={hasNotifications} onSearchChange={setSearch} onToggleNotifications={() => setNotificationsOpen(!notificationsOpen)} onMarkNotificationsRead={() => { setHasNotifications(false); setNotificationsOpen(false); showToast('Notifications marked as read.') }} onToggleProfile={() => setProfileOpen(!profileOpen)}/>
        <div className="page-content">
          <section className="page-heading"><div><div className="eyebrow">{activeNav === 'Overview' ? 'GOOD MORNING, ANGELA' : 'MANAGEMENT'}</div><h1>{pageTitle}</h1><p>{pageDescription}</p></div><div className="date-control"><button className="date-filter" onClick={() => setPeriodOpen(!periodOpen)}><Icon name="calendar" size={18}/>{period}<Icon name="chevron" size={16}/></button>{periodOpen && <div className="dropdown-menu">{['This week', 'This month', 'Last 30 days', 'This year'].map((option) => <button key={option} className={period === option ? 'selected' : ''} onClick={() => { setPeriod(option); setPeriodOpen(false) }}>{option}</button>)}</div>}</div></section>
          {activeNav === 'Overview' ? <OverviewDashboard visibleOrders={visibleOrders} metric={metric} metricOpen={metricOpen} panelMenu={panelMenu} activeChartPoint={activeChartPoint} tooltipPlacement={tooltipPlacement} onNavigate={navigate} onToggleMetric={() => setMetricOpen(!metricOpen)} onSelectMetric={(nextMetric) => { setMetric(nextMetric); setMetricOpen(false) }} onChartPointer={updateChartTooltip} onChartLeave={() => setChartHover(null)} onTogglePanelMenu={(menu) => setPanelMenu(panelMenu === menu ? null : menu)} onExport={(message) => { setPanelMenu(null); showToast(message) }} onOpenOrder={openOrder}/> : activeNav === 'Settings' ? <SettingsWorkspace autoApprove={autoApprove} digest={digest} onToggleApprove={() => setAutoApprove(!autoApprove)} onToggleDigest={() => setDigest(!digest)} onReset={() => { setAutoApprove(true); setDigest(true); showToast('Preferences restored to defaults.') }} onSave={() => showToast('Workspace preferences saved.')}/> : <EntityWorkspace section={activeNav} search={search} created={created[activeNav] ?? []} activeOnly={activeOnly} onToggleFilter={() => setActiveOnly(!activeOnly)} onAdd={() => setAddSection(activeNav)} onOpen={openRecord}/>}</div>
      </main>
      <DetailsModal modal={modal} onClose={() => setModal(null)}/>
      <AddRecordModal section={addSection} name={newRecordName} onNameChange={setNewRecordName} onClose={() => setAddSection(null)} onSubmit={createRecord}/>
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  </div>
}

export default App
