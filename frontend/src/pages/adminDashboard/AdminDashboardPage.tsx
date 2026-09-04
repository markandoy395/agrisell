import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { OverviewDashboard } from "../overviewDashboard/OverviewDashboard";
import { OrderWorkspace } from "../orderWorkspace/OrderWorkspace";
import { PaymentWorkspace } from "../paymentWorkspace/PaymentWorkspace";
import { UserWorkspace } from "../userWorkspace/UserWorkspace";
import { FarmerWorkspace } from "../farmerWorkspace/FarmerWorkspace";
import { DeliveryWorkspace } from "../deliveryWorkspace/DeliveryWorkspace";
import { LogisticsWorkspace } from "../logisticsWorkspace/LogisticsWorkspace";
import { DashboardSidebar } from "../../components/layout/DashboardSidebar";
import { DashboardTopbar } from "../../components/layout/DashboardTopbar";
import {
  AddRecordModal,
  CreateUserModal,
  DetailsModal,
  ProfileModal,
} from "../../components/ui/modals/DashboardModals";
import { EntityWorkspace } from "../entityWorkspace/EntityWorkspace";
import { Icon } from "../../components/ui/icon/Icon";
import { SettingsWorkspace } from "../settingsWorkspace/SettingsWorkspace";
import { SaleWorkspace } from "../saleWorkspace/SaleWorkspace";
import {
  approveFarmerProfile,
  approveRiderProfile,
  createAdminUser,
  createAdministrator,
  updateAdministratorPrivileges,
  updateAdminProfile,
} from "../../api/adminData";
import type { CreateUserInput } from "../../api/adminData";
import { getApiErrorMessage } from "../../api/adminAuth";
import type { AuthenticatedAdmin } from "../../api/adminAuth";
import { useAdminDatabase } from "../../hooks/useAdminDatabase";
import type {
  AdminProfile,
  DashboardModal,
  EntityRecord,
  LocationPin,
  NotificationItem,
  OrderRow,
  UserWorkspaceRow,
} from "../../types/dashboard";
import "./AdminDashboardPage.css";

function getInitials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "AD"
  );
}

const sectionPermissions: Record<string, string> = {
  Overview: "overview:view",
  Users: "users:manage",
  Farmers: "farmers:manage",
  "Logistics Companies": "logistics:manage",
  Deliveries: "logistics:manage",
  Orders: "orders:manage",
  Payments: "payments:view",
  "Sales & Discounts": "sales:manage",
  Reviews: "reviews:manage",
  Settings: "settings:manage",
};

const getInitialSection = (permissions: string[]) =>
  permissions.includes("admin:manage")
    ? "Overview"
    : Object.entries(sectionPermissions).find(([, permission]) =>
        permissions.includes(permission),
      )?.[0] ?? "Overview";

type AdminDashboardPageProps = {
  // The signed-in account determines both navigation and action access.
  admin: AuthenticatedAdmin;
  onSignOut: () => void;
};

export function AdminDashboardPage({ admin, onSignOut }: AdminDashboardPageProps) {
  const {
    data,
    error: databaseError,
    isLoading,
    refresh: refreshDatabase,
  } = useAdminDatabase();
  const [activeNav, setActiveNav] = useState(() => getInitialSection(admin.permissions));
  const [period, setPeriod] = useState("This month");
  const [search, setSearch] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] =
    useState<NotificationItem[]>([]);
  const [periodOpen, setPeriodOpen] = useState(false);
  const [metricOpen, setMetricOpen] = useState(false);
  const [metric, setMetric] = useState("Revenue");
  const [chartHover, setChartHover] = useState<number | null>(null);
  const [panelMenu, setPanelMenu] = useState<"commodity" | "delivery" | null>(
    null,
  );
  const [topProfileOpen, setTopProfileOpen] = useState(false);
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const [adminProfile, setAdminProfile] = useState<AdminProfile>(() => ({
    avatarUrl: admin.avatarUrl,
    email: admin.email,
    initials: getInitials(admin.name),
    name: admin.name,
    role: admin.permissions.includes("admin:manage")
      ? "Super administrator"
      : "Administrator",
  }));
  const [activeOnly, setActiveOnly] = useState(false);
  const [modal, setModal] = useState<DashboardModal>(null);
  const [addSection, setAddSection] = useState<string | null>(null);
  const [createUserType, setCreateUserType] = useState<
    CreateUserInput["accountType"] | null
  >(null);
  const [newRecordName, setNewRecordName] = useState("");
  const [created, setCreated] = useState<Record<string, EntityRecord[]>>({});
  const [toast, setToast] = useState("");
  const [autoApprove, setAutoApprove] = useState(true);
  const [digest, setDigest] = useState(true);

  const visibleOrders = useMemo(() => {
    const query = search.toLowerCase().trim();
    const orders = data?.orders ?? [];

    return query
      ? orders.filter((order) =>
          `${order.id} ${order.customer} ${order.item}`
            .toLowerCase()
            .includes(query),
        )
      : orders;
  }, [data?.orders, search]);
  const liveLocationPins = useMemo<LocationPin[]>(() => {
    if (!data) return [];

    const farmerNameById = new Map(
      data.farmers.map((farmer) => [farmer.entityId, farmer.primary]),
    );

    return data.farmerFarms
      .filter((farm) => farm.gpsLat !== 0 || farm.gpsLong !== 0)
      .map((farm) => ({
        detail: farm.farmLocation,
        gpsLat: farm.gpsLat,
        gpsLong: farm.gpsLong,
        id: `farm-${farm.id}`,
        kind: "farm" as const,
        label: farm.farmName,
        owner: farmerNameById.get(farm.farmerId) ?? "Registered farmer",
        status: farm.status,
        tone: farm.tone,
      }));
  }, [data]);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  };

  const notifyUpdate = (title: string, message: string) => {
    showToast(message);
    setNotifications((current) =>
      [
        {
          id: `${Date.now()}-${current.length}`,
          title,
          message,
          time: "Just now",
          read: false,
        },
        ...current,
      ].slice(0, 12),
    );
  };

  const navigate = (section: string) => {
    const requiredPermission = sectionPermissions[section];
    if (requiredPermission && !admin.permissions.includes(requiredPermission) && !admin.permissions.includes("admin:manage")) {
      showToast("Your administrator account does not have access to that area.");
      return;
    }
    setActiveNav(section);
    setActiveOnly(false);
    setPanelMenu(null);
    setPeriodOpen(false);
    setMetricOpen(false);
  };

  const createRecord = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!addSection || !newRecordName.trim()) return;
    const record = {
      primary: newRecordName.trim(),
      secondary: "Created just now",
      category: "New record",
      value: "Not set",
      status: "Active",
      tone: "green",
    };
    setCreated((current) => ({
      ...current,
      [addSection]: [record, ...(current[addSection] ?? [])],
    }));
    setAddSection(null);
    setNewRecordName("");
    notifyUpdate(
      `New ${addSection.toLowerCase()} added`,
      `${newRecordName.trim()} was added to ${addSection}.`,
    );
  };

  const openRecord = (record: EntityRecord) => {
    const gpsDetails =
      typeof record.gpsLat === "number" && typeof record.gpsLong === "number"
        ? `\n\nGPS location: ${record.gpsLat.toFixed(4)}, ${record.gpsLong.toFixed(4)}`
        : "";

    setModal({
      title: record.primary,
      message: `${record.secondary}\n\n${record.category}\n${record.value}${gpsDetails}\n\nCurrent status: ${record.status}`,
    });
  };
  const openOrder = (order: OrderRow) =>
    setModal({
      title: `Order ${order.id}`,
      message: `${order.customer}\n\n${order.item} - ${order.qty}\nTotal: ${order.total}\n\nCurrent status: ${order.status}`,
    });
  const openUser = (user: UserWorkspaceRow) =>
    setModal({
      title: `${user.firstName} ${user.lastName}`,
      message: `user_id: ${user.userId}\nemail: ${user.email}\ncontact_number: ${user.contactNumber}\naccount_status: ${user.accountStatus}\ncreated_at: ${user.createdAt}\nupdated_at: ${user.updatedAt}\ngender: ${user.gender}\ndate_of_birth: ${user.dateOfBirth}\ne_wallet_details: ${user.eWalletDetails}\n\nbuyer_user_id: ${user.buyerUserId ?? "Not a buyer"}\nshipping_address: ${user.shippingAddress ?? "Not set"}\nloyalty_points: ${user.loyaltyPoints ?? "Not set"}\npreferred_payment_method: ${user.preferredPaymentMethod ?? "Not set"}\nuser_type: ${user.userType}\nbusiness_name: ${user.businessName || "Not set"}`,
    });
  const updateChartTooltip = (
    clientX: number,
    element: HTMLDivElement,
    pointCount: number,
  ) => {
    const bounds = element.getBoundingClientRect();
    const progress = Math.min(
      1,
      Math.max(0, (clientX - bounds.left) / bounds.width),
    );
    setChartHover(pointCount > 0 ? Math.round(progress * (pointCount - 1)) : null);
  };

  const pageTitle =
    activeNav === "Overview" ? "Here's what's growing today." : activeNav;
  const pageDescription =
    activeNav === "Overview"
      ? "A live look at your marketplace, farms, and fulfilment."
      : activeNav === "Deliveries"
        ? "Track active delivery routes, riders, checkpoints, and arrival windows."
      : activeNav === "Settings"
        ? "Fine-tune the way your admin workspace works."
        : `Monitor and manage your ${activeNav.toLowerCase()} in one place.`;
  const showPageHeading = ![
    "Orders",
    "Users",
    "Farmers",
    "Logistics Companies",
    "Deliveries",
    "Payments",
    "Reviews",
    "Sales & Discounts",
  ].includes(activeNav);
  return (
    <div className="dashboard">
      <DashboardSidebar
        activeNav={activeNav}
        profile={adminProfile}
        permissions={admin.permissions}
        onNavigate={navigate}
        onOpenHelp={() => {
          setModal({
            title: "Help Center Coming Soon",
            message:
              "The Agrisell Help Center is currently under development. We're working to make support resources available soon. Thank you for your patience.",
          });
        }}
      />
      <main className="main-content">
        <DashboardTopbar
          activeNav={activeNav}
          search={search}
          notificationsOpen={notificationsOpen}
          notifications={notifications}
          onSearchChange={setSearch}
          onToggleNotifications={() =>
            setNotificationsOpen((isOpen) => !isOpen)
          }
          onMarkNotificationsRead={() => {
            setNotifications((current) =>
              current.map((notification) => ({
                ...notification,
                read: true,
              })),
            );
            showToast("Notifications marked as read.");
          }}
          onHideNotification={(notificationId) =>
            setNotifications((current) =>
              current.filter(
                (notification) => notification.id !== notificationId,
              ),
            )
          }
          profile={adminProfile}
          profileOpen={topProfileOpen}
          onToggleProfile={() => setTopProfileOpen((isOpen) => !isOpen)}
          onOpenProfile={() => {
            setTopProfileOpen(false);
            setProfileEditorOpen(true);
          }}
          onOpenPreferences={() => {
            navigate("Settings");
            setTopProfileOpen(false);
          }}
          onOpenHelp={() => {
            setTopProfileOpen(false);
            setModal({
              title: "Help Center Coming Soon",
              message: "The Agrisell Help Center is currently under development. We're working to make support resources available soon. Thank you for your patience.",
            });
          }}
          onOpenAccountAction={(action) => {
            setTopProfileOpen(false);
            setModal({
              title: `${action} Coming Soon`,
              message: `${action} is currently under development. This option will be available in a future update.`,
            });
          }}
          onSignOut={() => {
            setTopProfileOpen(false);
            onSignOut();
          }}
        />
        <div className="page-content">
          {showPageHeading && (
            <section className={`page-heading${activeNav === "Overview" ? " page-heading--overview" : ""}`}>
              <div className={activeNav === "Settings" ? "settings-page-title" : undefined}>
                {activeNav === "Settings" && <span className="settings-page-title-icon"><Icon name="settings" size={25} /></span>}
                <div>
                <div className="eyebrow">
                  {activeNav === "Overview" ? (
                    <>
                      GOOD MORNING, {adminProfile.name.split(" ")[0].toUpperCase()}
                      <Icon name="leaf" size={13} />
                    </>
                  ) : "MANAGEMENT"}
                </div>
                <h1>{pageTitle}</h1>
                <p>{pageDescription}</p>
                </div>
              </div>
              <div className="date-control">
                <button
                  className="date-filter"
                  type="button"
                  onClick={() => setPeriodOpen((isOpen) => !isOpen)}
                  aria-expanded={periodOpen}
                  aria-haspopup="menu"
                  aria-controls="dashboard-period-menu"
                >
                  <Icon name="calendar" size={18} />
                  {period}
                  <Icon name="chevron" size={16} />
                </button>
                {periodOpen && (
                  <div
                    className="dropdown-menu"
                    id="dashboard-period-menu"
                    role="menu"
                  >
                    {[
                      "This week",
                      "This month",
                      "Last 30 days",
                      "This year",
                    ].map((option) => (
                      <button
                        key={option}
                        className={period === option ? "selected" : ""}
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setPeriod(option);
                          setPeriodOpen(false);
                        }}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}
          {isLoading ? (
            <section
              className="dashboard-skeleton"
              aria-busy="true"
              aria-label="Loading Agrisell marketplace data"
            >
              <span className="skeleton-sr-only">
                Loading Agrisell marketplace data...
              </span>
              <div className="skeleton-summary-grid" aria-hidden="true">
                {Array.from({ length: 4 }, (_, index) => (
                  <article className="skeleton-card" key={index}>
                    <i className="skeleton-line skeleton-line-short" />
                    <i className="skeleton-line skeleton-line-value" />
                    <i className="skeleton-line skeleton-line-medium" />
                  </article>
                ))}
              </div>
              <div className="skeleton-content-grid" aria-hidden="true">
                <article className="skeleton-panel skeleton-panel-chart">
                  <i className="skeleton-line skeleton-line-title" />
                  <i className="skeleton-chart" />
                </article>
                <article className="skeleton-panel">
                  <i className="skeleton-line skeleton-line-title" />
                  <i className="skeleton-list-line" />
                  <i className="skeleton-list-line" />
                  <i className="skeleton-list-line skeleton-list-line-last" />
                </article>
              </div>
              <article className="skeleton-panel skeleton-table" aria-hidden="true">
                <i className="skeleton-line skeleton-line-title" />
                {Array.from({ length: 4 }, (_, index) => (
                  <i className="skeleton-table-row" key={index} />
                ))}
              </article>
            </section>
          ) : databaseError ? (
            <section className="database-data-state is-error" role="alert">
              {databaseError}
            </section>
          ) : data && activeNav === "Overview" ? (
            <OverviewDashboard
              overview={data.overview}
              visibleOrders={visibleOrders}
              metric={metric}
              metricOpen={metricOpen}
              panelMenu={panelMenu}
              activeChartIndex={chartHover}
              onNavigate={navigate}
              onToggleMetric={() => setMetricOpen(!metricOpen)}
              onSelectMetric={(nextMetric) => {
                setMetric(nextMetric);
                setMetricOpen(false);
              }}
              onChartPointer={updateChartTooltip}
              onChartLeave={() => setChartHover(null)}
              onTogglePanelMenu={(menu) =>
                setPanelMenu(panelMenu === menu ? null : menu)
              }
              onExport={(message) => {
                setPanelMenu(null);
                showToast(message);
              }}
              onOpenOrder={openOrder}
            />
          ) : data && activeNav === "Orders" ? (
            <OrderWorkspace orders={visibleOrders} onOpenOrder={openOrder} />
          ) : data && activeNav === "Users" ? (
            <UserWorkspace
              onAdd={() => setCreateUserType("user")}
              onOpenUser={openUser}
              users={data.users}
            />
          ) : data && activeNav === "Farmers" ? (
            <FarmerWorkspace
              farmers={data.farmers}
              farms={data.farmerFarms}
              search={search}
              created={created[activeNav] ?? []}
              onAdd={() => setCreateUserType("farmer")}
              onOpen={openRecord}
              onReviewAction={async (action, farmer) => {
                try {
                  if (action === "approved") {
                    await approveFarmerProfile(farmer.entityId ?? "");
                    await refreshDatabase();
                  }

                  notifyUpdate(
                    action === "approved" ? "Farmer approved" : "Information requested",
                    action === "approved"
                      ? `${farmer.primary} is now verified and ready to sell.`
                      : `Requested verification information from ${farmer.primary}.`,
                  );
                } catch (error) {
                  showToast(
                    getApiErrorMessage(
                      error,
                      "The farmer approval could not be saved. Please try again.",
                    ),
                  );
                  throw error;
                }
              }}
            />
          ) : data && activeNav === "Logistics Companies" ? (
            <LogisticsWorkspace
              created={created[activeNav] ?? []}
              records={data.entityRows[activeNav] ?? []}
              search={search}
              onAdd={() => setAddSection(activeNav)}
              onApproveRider={async (rider) => {
                try {
                  await approveRiderProfile(rider.entityId ?? "");
                  await refreshDatabase();
                  notifyUpdate(
                    "Rider approved",
                    `${rider.primary} can now be activated for delivery work.`,
                  );
                } catch (error) {
                  showToast(
                    getApiErrorMessage(
                      error,
                      "The rider approval could not be saved. Please try again.",
                    ),
                  );
                  throw error;
                }
              }}
              onOpen={openRecord}
            />
          ) : data && activeNav === "Deliveries" ? (
            <DeliveryWorkspace
              created={created[activeNav] ?? []}
              records={data.entityRows[activeNav] ?? []}
              search={search}
              onAdd={() => setAddSection(activeNav)}
              onOpen={openRecord}
            />
          ) : data && activeNav === "Payments" ? (
            <PaymentWorkspace
              paymentActivityBars={data.overview.paymentActivityBars}
              payments={data.payments}
              search={search}
              created={created[activeNav] ?? []}
              activeOnly={activeOnly}
              onToggleFilter={() => setActiveOnly(!activeOnly)}
              onOpen={openRecord}
              period={period}
            />
          ) : data && activeNav === "Sales & Discounts" ? (
            <SaleWorkspace onNotice={showToast} />
          ) : data && activeNav === "Settings" ? (
            <SettingsWorkspace
              administrators={data.administrators}
              canManageAdmins={admin.permissions.includes("admin:manage")}
              autoApprove={autoApprove}
              digest={digest}
              onToggleApprove={() => {
                const nextAutoApprove = !autoApprove;
                setAutoApprove(nextAutoApprove);
                notifyUpdate(
                  "Approval preference updated",
                  `Automatic farmer approvals ${nextAutoApprove ? "enabled" : "disabled"}.`,
                );
              }}
              onToggleDigest={() => {
                const nextDigest = !digest;
                setDigest(nextDigest);
                notifyUpdate(
                  "Digest preference updated",
                  `Daily activity digest ${nextDigest ? "enabled" : "disabled"}.`,
                );
              }}
              onReset={() => {
                setAutoApprove(true);
                setDigest(true);
                notifyUpdate(
                  "Preferences restored",
                  "Workspace preferences were restored to defaults.",
                );
              }}
              onSave={() =>
                notifyUpdate(
                  "Preferences saved",
                  "Workspace preferences saved.",
                )
              }
              onCreateAdministrator={async (input) => {
                await createAdministrator(input);
                await refreshDatabase();
                notifyUpdate(
                  "Administrator created",
                  `${input.firstName} ${input.lastName} can now sign in with the selected privileges.`,
                );
              }}
              onUpdateAdministratorPrivileges={async (userId, permissions) => {
                await updateAdministratorPrivileges(userId, permissions);
                await refreshDatabase();
                notifyUpdate(
                  "Administrator privileges updated",
                  "The administrator's dashboard privileges were updated.",
                );
              }}
            />
          ) : data ? (
            <EntityWorkspace
              locationPins={liveLocationPins}
              records={data.entityRows[activeNav] ?? []}
              section={activeNav}
              search={search}
              created={created[activeNav] ?? []}
              activeOnly={activeOnly}
              period={period}
              onToggleFilter={() => setActiveOnly(!activeOnly)}
              onAdd={() => setAddSection(activeNav)}
              onOpen={openRecord}
            />
          ) : null}
        </div>
      </main>
      <DetailsModal modal={modal} onClose={() => setModal(null)} />
      <AddRecordModal
        section={addSection}
        name={newRecordName}
        onNameChange={setNewRecordName}
        onClose={() => setAddSection(null)}
        onSubmit={createRecord}
      />
      {createUserType && (
        <CreateUserModal
          defaultAccountType={createUserType}
          onClose={() => setCreateUserType(null)}
          onCreate={async (input) => {
            await createAdminUser(input);
            await refreshDatabase();
            notifyUpdate(
              input.accountType === "farmer" ? "Farmer account created" : "User account created",
              `${input.firstName} ${input.lastName} can now sign in to Agrisell.`,
            );
          }}
        />
      )}
      {profileEditorOpen && (
        <ProfileModal
          permissions={admin.permissions}
          profile={adminProfile}
          onClose={() => setProfileEditorOpen(false)}
          onSave={async (profile) => {
            const savedProfile = await updateAdminProfile({
              avatarUrl: profile.avatarUrl === adminProfile.avatarUrl
                ? undefined
                : profile.avatarUrl,
              name: profile.name,
            });
            setAdminProfile({
              ...profile,
              ...savedProfile,
              initials: getInitials(savedProfile.name),
            });
            setProfileEditorOpen(false);
            showToast("Profile information updated.");
          }}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
