import { useCallback, useEffect, useMemo, useState } from 'react'
import { getAdminPreferences } from '../../api/adminData'
import type { AuthenticatedAdmin } from '../../api/adminAuth'
import { useAdminDatabase } from '../../hooks/useAdminDatabase'
import type {
  AdminProfile, DashboardModal, EntityRecord, OrderRow, UserWorkspaceRow,
} from '../../types/dashboard'
import {
  createFarmLocationPins, filterOrders, formatOrderModal, formatRecordModal,
  getInitialSection, getInitials, SECTION_PERMISSIONS,
} from './adminDashboard.utils'
import { preloadDeliveries } from '../deliveryWorkspace/deliveryCache'
import { preloadCommodities } from '../commodityWorkspace/commodityCache'
import { preloadCategories } from '../categoryWorkspace/categoryCache'
import { preloadSafetyIncidents } from '../safetyWorkspace/safetyCache'
import { useAdminNotifications } from './useAdminNotifications'
import { useGlobalIssues } from './useGlobalIssues'
import type { AccountTool } from '../../components/ui/modals/AdminAccountTools'

export function useAdminDashboardState(admin: AuthenticatedAdmin) {
  const database = useAdminDatabase()
  const [activeNav, setActiveNav] = useState(() => getInitialSection(admin.permissions))
  const [period, setPeriod] = useState('This month')
  const [search, setSearch] = useState('')
  const [periodOpen, setPeriodOpen] = useState(false)
  const [metricOpen, setMetricOpen] = useState(false)
  const [metric, setMetric] = useState('Revenue')
  const [chartHover, setChartHover] = useState<number | null>(null)
  const [panelMenu, setPanelMenu] = useState<'commodity' | 'delivery' | null>(null)
  const [topProfileOpen, setTopProfileOpen] = useState(false)
  const [profileEditorOpen, setProfileEditorOpen] = useState(false)
  const [accountTool, setAccountTool] = useState<AccountTool | null>(null)
  const [adminProfile, setAdminProfile] = useState<AdminProfile>(() => ({
    avatarUrl: admin.avatarUrl,
    email: admin.email,
    initials: getInitials(admin.name),
    name: admin.name,
    role: admin.permissions.includes('admin:manage') ? 'Super administrator' : 'Administrator',
  }))
  const [activeOnly, setActiveOnly] = useState(false)
  const [deliveryTargetId, setDeliveryTargetId] = useState<number | null>(null)
  const [modal, setModal] = useState<DashboardModal>(null)
  const [selectedUser, setSelectedUser] = useState<UserWorkspaceRow | null>(null)
  const [verificationTarget, setVerificationTarget] = useState<{
    entity: EntityRecord
    type: 'farmer' | 'rider'
    initialDecision?: 'rejected'
  } | null>(null)
  const [addSection, setAddSection] = useState<string | null>(null)
  const [createUserType, setCreateUserType] = useState<'user' | 'farmer' | null>(null)
  const [newRecordName, setNewRecordName] = useState('')
  const [broadcastModalOpen, setBroadcastModalOpen] = useState(false)
  const [toast, setToast] = useState('')

  const [autoApprove, setAutoApprove] = useState(true)
  const [digest, setDigest] = useState(true)

  const canManageSettings =
    admin.permissions.includes('settings:manage') || admin.permissions.includes('admin:manage')

  const showToast = useCallback((message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 2600)
  }, [])

  const adminNotifications = useAdminNotifications(admin, database.data, showToast)
  const issues = useGlobalIssues(database.error, database.refresh)

  useEffect(() => {
    const isSuperAdmin = admin.permissions.includes('admin:manage')
    const hasLogistics = isSuperAdmin || admin.permissions.includes('logistics:manage')
    const hasFarmers = isSuperAdmin || admin.permissions.includes('farmers:manage')

    if (hasLogistics) {
      preloadDeliveries()
      preloadSafetyIncidents()
    }
    if (hasFarmers) {
      preloadCommodities()
      preloadCategories()
    }
  }, [admin.permissions])

  useEffect(() => {
    if (!canManageSettings) return
    void getAdminPreferences()
      .then((preferences) => {
        setAutoApprove(preferences.autoApprove)
        setDigest(preferences.digest)
      })
      .catch(() => {
        showToast('Workspace preferences could not be loaded.')
      })
  }, [admin.email, canManageSettings])

  const visibleOrders = useMemo(
    () => filterOrders(database.data?.orders ?? [], search),
    [database.data?.orders, search],
  )
  const locationPins = useMemo(
    () => (database.data ? createFarmLocationPins(database.data) : []),
    [database.data],
  )
  const navigate = (section: string) => {
    const targetSection = section === 'Logistics Companies' ? 'Riders' : section
    const permission = SECTION_PERMISSIONS[targetSection] ?? SECTION_PERMISSIONS[section]
    const hasAccess = !permission || admin.permissions.includes(permission) || admin.permissions.includes('admin:manage')
    if (!hasAccess) return showToast('Your administrator account does not have access to that area.')
    setActiveNav(targetSection)
    setActiveOnly(false)
    setPanelMenu(null)
    setPeriodOpen(false)
    setMetricOpen(false)
  }
  const openRecord = (record: EntityRecord) => setModal(formatRecordModal(record))
  const openOrder = (order: OrderRow) => setModal(formatOrderModal(order))
  const openDelivery = (deliveryId: number) => {
    const hasLogisticsAccess =
      admin.permissions.includes('logistics:manage') || admin.permissions.includes('admin:manage')
    if (!hasLogisticsAccess) {
      showToast('Your administrator account does not have access to delivery management.')
      return
    }
    setDeliveryTargetId(deliveryId)
    navigate('Deliveries')
  }
  const updateChartTooltip = (clientX: number, element: HTMLDivElement, count: number) => {
    const bounds = element.getBoundingClientRect()
    const progress = Math.min(1, Math.max(0, (clientX - bounds.left) / bounds.width))
    setChartHover(count > 0 ? Math.round(progress * (count - 1)) : null)
  }

  return {
    ...adminNotifications,
    activeNav,
    accountTool,
    activeOnly,
    addSection,
    adminProfile,
    autoApprove,
    broadcastModalOpen,
    chartHover,
    createUserType,
    database,
    digest,
    deliveryTargetId,
    dismissGlobalIssue: issues.dismissGlobalIssue,
    globalIssue: issues.globalIssue,
    locationPins,
    metric,
    metricOpen,
    modal,
    navigate,
    reportGlobalIssue: issues.reportGlobalIssue,
    newRecordName,

    openOrder,
    openDelivery,
    openRecord,
    panelMenu,
    period,
    periodOpen,
    profileEditorOpen,
    search,
    selectedUser,
    setActiveOnly,
    setAccountTool,
    setAddSection,
    setAdminProfile,
    setAutoApprove,
    setBroadcastModalOpen,
    setChartHover,

    setCreateUserType,
    setDigest,
    setDeliveryTargetId,
    setMetric,
    setMetricOpen,
    setModal,
    setNewRecordName,
    setPanelMenu,
    setPeriod,
    setPeriodOpen,
    setProfileEditorOpen,
    setSearch,
    setSelectedUser,
    setTopProfileOpen,
    setVerificationTarget,
    showToast,
    toast,
    topProfileOpen,
    updateChartTooltip,
    verificationTarget,
    visibleOrders,
  }
}

export type AdminDashboardState = ReturnType<typeof useAdminDashboardState>
