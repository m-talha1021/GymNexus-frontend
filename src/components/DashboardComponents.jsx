
import { useEffect, useMemo, useRef, useState } from "react";

import {
  LayoutDashboard,
  Users,
  Wallet,
  Package,
  MessageSquare,
  Settings,
  LogOut,
  Bell,
  Menu,
  UserCheck,
  AlertCircle,
  Plus,
  Trash2,
  X,
  CalendarClock,
} from "lucide-react";

import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";

import { db } from "../firebase/config";

// HELPERS

const money = (value) =>
  `Rs. ${Number(value || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 0,
  })}`;

const asDate = (value) => {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const memberName = (member) =>
  member.fullName || member.name || "Unnamed member";

const paymentName = (payment) =>
  payment.memberName ||
  payment.fullName ||
  payment.memberId ||
  "A member";

function getMemberStatus(member) {
  const expiry = asDate(
    member.membershipExpiryDate || member.expiryDate
  );

  const savedStatus = String(
    member.membershipStatus || member.status || ""
  ).toLowerCase();

  if (savedStatus === "suspended") return "Suspended";
  if (savedStatus === "expired") return "Expired";
  if (expiry && expiry < new Date()) return "Expired";

  if (savedStatus === "active" || (expiry && expiry >= new Date())) {
    return "Active";
  }

  return "Not set";
}

// SIDEBAR

export function Sidebar({
  isOpen,
  onLogout,
  activePage = "dashboard",
  onNavigate,
}) {
  const menuItems = [
    {
      name: "Dashboard",
      page: "dashboard",
      icon: LayoutDashboard,
    },
    {
      name: "Members",
      page: "members",
      icon: Users,
    },
    {
      name: "Payments",
      page: "payments",
      icon: Wallet,
    },
    {
      name: "Packages",
      page: "packages",
      icon: Package,
    },
    {
      name: "Inquiries",
      page: "inquiries",
      icon: MessageSquare,
    },
  ];

  return (
    <aside className={`sidebar ${isOpen ? "open" : ""}`}>
      <div className="brand">
        <a href=""><img src="/src/assets/logo.png" alt="GymNexus Logo" /></a>
      </div>

      <div className="sidebar-label">MAIN MENU</div>

      <nav className="sidebar-nav">
        {menuItems.map(({ name, page, icon: Icon }) => (
          <button
            type="button"
            key={page}
            className={`nav-item ${activePage === page ? "active" : ""
              }`}
            onClick={() => onNavigate?.(page)}
            aria-current={
              activePage === page ? "page" : undefined
            }
          >
            <Icon size={19} />
            <span>{name}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-bottom">
        <a href="#settings" className="nav-item">
          <Settings size={19} />
          <span>Settings</span>
        </a>

        <button
          type="button"
          className="nav-item logout sidebar-logout"
          onClick={onLogout}
        >
          <LogOut size={19} />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
}

// HEADER + LIVE PAYMENT NOTIFICATIONS

export function Header({
  onMenuClick,
  user,
  ownerProfile,
  activePage = "dashboard",
}) {
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [newCount, setNewCount] = useState(0);
  const [paymentNotifications, setPaymentNotifications] = useState([]);
  const [notificationError, setNotificationError] = useState("");

  const knownPaymentIds = useRef(null);

  useEffect(() => {
    if (!user?.uid) return undefined;

    knownPaymentIds.current = null;
    setPaymentNotifications([]);
    setNewCount(0);

    const paymentsQuery = query(
      collection(db, "payments"),
      where("ownerId", "==", user.uid)
    );

    const unsubscribe = onSnapshot(
      paymentsQuery,
      (snapshot) => {
        const payments = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        }));

        payments.sort((a, b) => {
          const aDate =
            asDate(a.createdAt || a.paymentDate)?.getTime() || 0;

          const bDate =
            asDate(b.createdAt || b.paymentDate)?.getTime() || 0;

          return bDate - aDate;
        });

        if (knownPaymentIds.current === null) {
          knownPaymentIds.current = new Set(
            snapshot.docs.map((item) => item.id)
          );
        } else {
          const added = snapshot
            .docChanges()
            .filter((change) => change.type === "added")
            .filter(
              (change) =>
                !knownPaymentIds.current.has(change.doc.id)
            );

          if (added.length) {
            setNewCount((count) => count + added.length);

            setPaymentNotifications((current) => {
              const additions = added.map((change) => ({
                id: change.doc.id,
                ...change.doc.data(),
              }));

              return [...additions, ...current]
                .filter(
                  (item, index, all) =>
                    all.findIndex(
                      (entry) => entry.id === item.id
                    ) === index
                )
                .slice(0, 12);
            });
          }

          snapshot.docs.forEach((item) =>
            knownPaymentIds.current.add(item.id)
          );
        }

        setPaymentNotifications((current) => {
          const merged = [...current, ...payments];

          return merged
            .filter(
              (item, index, all) =>
                all.findIndex(
                  (entry) => entry.id === item.id
                ) === index
            )
            .sort((a, b) => {
              const aDate =
                asDate(a.createdAt || a.paymentDate)?.getTime() || 0;

              const bDate =
                asDate(b.createdAt || b.paymentDate)?.getTime() || 0;

              return bDate - aDate;
            })
            .slice(0, 12);
        });

        setNotificationError("");
      },
      (error) => {
        console.error(
          "Payment notifications could not load:",
          error
        );

        setNotificationError(
          "Payment notifications could not be loaded."
        );
      }
    );

    return () => unsubscribe();
  }, [user?.uid]);

  const displayName =
    ownerProfile?.gymName ||
    ownerProfile?.fullName ||
    user?.displayName ||
    user?.email ||
    "Gym Owner";

  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");

  const pageTitle = {
    dashboard: "Dashboard",
    members: "Members",
    payments: "Payments",
    packages: "Packages",
    inquiries: "Inquiries",
    settings: "Settings",
  };

  const pageDescription = {
    dashboard: "Welcome back! Here's your gym overview.",
    members: "Manage and organize your gym members.",
    payments: "Manage your gym payments.",
    packages: "Manage your membership packages.",
    inquiries: "Manage your gym inquiries.",
    settings: "Manage your gym settings.",
  };

  return (
    <header className="top-header">
      <button
        className="mobile-menu"
        onClick={onMenuClick}
        aria-label="Open menu"
      >
        <Menu size={22} />
      </button>

      <div className="header-title">
        <h2>{pageTitle[activePage] || "Dashboard"}</h2>

        <p>
          {pageDescription[activePage] ||
            "Welcome to GymNexus."}
        </p>
      </div>

      <div className="header-actions">
        <div className="notification-wrap">
          <button
            type="button"
            className="notification-button"
            aria-label="Payment notifications"
            aria-expanded={notificationsOpen}
            onClick={() => {
              setNotificationsOpen((open) => !open);
              setNewCount(0);
            }}
          >
            <Bell size={20} />

            {newCount > 0 && (
              <span className="notification-count">
                {newCount > 9 ? "9+" : newCount}
              </span>
            )}

            {newCount === 0 &&
              paymentNotifications.length > 0 && (
                <span className="notification-dot" />
              )}
          </button>

          {notificationsOpen && (
            <section className="notification-dropdown">
              <div className="notification-heading">
                <div>
                  <strong>Payment notifications</strong>
                  <small>
                    New member payments appear here
                  </small>
                </div>

                <button
                  type="button"
                  className="notification-close"
                  onClick={() =>
                    setNotificationsOpen(false)
                  }
                  aria-label="Close notifications"
                >
                  <X size={17} />
                </button>
              </div>

              {notificationError ? (
                <p className="notification-empty">
                  {notificationError}
                </p>
              ) : paymentNotifications.length === 0 ? (
                <p className="notification-empty">
                  No payment activity yet.
                </p>
              ) : (
                <div className="notification-list">
                  {paymentNotifications.map((payment) => (
                    <div
                      className="notification-item"
                      key={payment.id}
                    >
                      <span className="notification-payment-icon">
                        <Wallet size={16} />
                      </span>

                      <div>
                        <strong>Payment received</strong>

                        <p>
                          {paymentName(payment)} paid{" "}
                          {money(
                            payment.amount || payment.paidAmount
                          )}
                        </p>

                        <small>
                          {asDate(
                            payment.createdAt ||
                            payment.paymentDate
                          )?.toLocaleString() || "Recently"}
                        </small>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>

        <div className="profile">
          <div className="profile-avatar">
            {initials || "GO"}
          </div>

          <div className="profile-info">
            <strong>{displayName}</strong>
            <small>Gym Owner</small>
          </div>
        </div>
      </div>
    </header>
  );
}

// STAT CARD

function StatCard({
  title,
  value,
  change,
  icon: Icon,
  color,
}) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${color}`}>
        <Icon size={23} />
      </div>

      <p className="stat-title">{title}</p>

      <h2>{value}</h2>

      <span className="stat-change">{change}</span>
    </div>
  );
}

// DASHBOARD — LIVE FIRESTORE DATA

export function Dashboard({ user, onNavigate }) {
  const [members, setMembers] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user?.uid) {
      setLoading(false);
      return undefined;
    }

    setLoading(true);

    let membersReady = false;
    let paymentsReady = false;

    const finishLoading = () => {
      if (membersReady && paymentsReady) {
        setLoading(false);
      }
    };

    const membersQuery = query(
      collection(db, "members"),
      where("ownerId", "==", user.uid)
    );

    const paymentsQuery = query(
      collection(db, "payments"),
      where("ownerId", "==", user.uid)
    );

    const unsubscribeMembers = onSnapshot(
      membersQuery,
      (snapshot) => {
        setMembers(
          snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          }))
        );

        membersReady = true;
        finishLoading();
        setError("");
      },
      (err) => {
        console.error("Members could not load:", err);

        setError(
          "Could not load members. Check Firestore rules and ownerId fields."
        );

        membersReady = true;
        finishLoading();
      }
    );

    const unsubscribePayments = onSnapshot(
      paymentsQuery,
      (snapshot) => {
        setPayments(
          snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          }))
        );

        paymentsReady = true;
        finishLoading();
      },
      (err) => {
        console.error("Payments could not load:", err);

        setError(
          "Could not load payments. Check Firestore rules and ownerId fields."
        );

        paymentsReady = true;
        finishLoading();
      }
    );

    return () => {
      unsubscribeMembers();
      unsubscribePayments();
    };
  }, [user?.uid]);

  // DASHBOARD STATISTICS

  const stats = useMemo(() => {
    const now = new Date();

    const monthStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      1
    );

    const activeMembers = members.filter(
      (member) => getMemberStatus(member) === "Active"
    ).length;

    const monthlyRevenue = payments.reduce(
      (total, payment) => {
        const status = String(
          payment.status || payment.paymentStatus || ""
        ).toLowerCase();

        const paid = [
          "paid",
          "completed",
          "success",
          "successful",
        ].includes(status);

        const date = asDate(
          payment.createdAt || payment.paymentDate
        );

        if (paid && date && date >= monthStart && date <= now) {
          return (
            total +
            Number(payment.amount || payment.paidAmount || 0)
          );
        }

        return total;
      },
      0
    );

    const pendingPayments = payments.reduce(
      (total, payment) => {
        const status = String(
          payment.status || payment.paymentStatus || ""
        ).toLowerCase();

        if (
          ["pending", "due", "unpaid", "partial"].includes(status)
        ) {
          return (
            total +
            Number(
              payment.pendingAmount ??
              payment.balance ??
              payment.amount ??
              0
            )
          );
        }

        return total;
      },
      0
    );

    const recentMembers = [...members]
      .sort((a, b) => {
        const aDate =
          asDate(a.createdAt || a.joiningDate)?.getTime() || 0;

        const bDate =
          asDate(b.createdAt || b.joiningDate)?.getTime() || 0;

        return bDate - aDate;
      })
      .slice(0, 5);

    const upcoming = members
      .map((member) => ({
        ...member,
        expiry: asDate(
          member.membershipExpiryDate || member.expiryDate
        ),
      }))
      .filter((member) => {
        if (!member.expiry) return false;

        const days = Math.ceil(
          (member.expiry - now) / 86400000
        );

        return days >= 0 && days <= 7;
      })
      .sort((a, b) => a.expiry - b.expiry);

    return {
      activeMembers,
      monthlyRevenue,
      pendingPayments,
      recentMembers,
      upcoming,
    };
  }, [members, payments]);

  // DELETE MEMBER

  const removeMember = async (member) => {
    const name = memberName(member);

    const confirmed = window.confirm(
      `Remove ${name} from your member records? This cannot be undone.`
    );

    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, "members", member.id));
    } catch (err) {
      console.error("Member deletion failed:", err);

      window.alert(
        "Could not remove this member. Check Firestore rules."
      );
    }
  };

  if (loading) {
    return (
      <div className="dashboard-content">
        <p>Loading gym records...</p>
      </div>
    );
  }

  return (
    <div className="dashboard-content" id="dashboard">

      {/* PAGE HEADING */}

      <div className="page-heading">
        <div>
          <h1>Overview</h1>
          <p>Here's what's happening at your gym.</p>
        </div>

        <button
          type="button"
          className="add-button"
          onClick={() => onNavigate?.("members")}
        >
          <Plus size={18} />
          Add Member
        </button>
      </div>

      {error && (
        <div className="dashboard-error">
          {error}
        </div>
      )}

      {/* STATISTICS */}

      <div className="stats-grid">
        <StatCard
          title="Total Members"
          value={members.length}
          change="Registered members"
          icon={Users}
          color="blue"
        />

        <StatCard
          title="Active Members"
          value={stats.activeMembers}
          change="Currently active"
          icon={UserCheck}
          color="green"
        />

        <StatCard
          title="Monthly Revenue"
          value={money(stats.monthlyRevenue)}
          change="Recorded payments this month"
          icon={Wallet}
          color="purple"
        />

        <StatCard
          title="Pending Payments"
          value={money(stats.pendingPayments)}
          change="Outstanding recorded payments"
          icon={AlertCircle}
          color="orange"
        />
      </div>

      {/* DASHBOARD GRID */}

      <div className="dashboard-grid">

        {/* RECENT MEMBERS */}

        <section className="dashboard-panel members-panel">
          <div className="panel-heading">
            <div>
              <h3>Recent Members</h3>
              <p>Recently registered gym members</p>
            </div>

            <button
              type="button"
              className="text-button"
              onClick={() => onNavigate?.("members")}
            >
              View All
            </button>
          </div>

          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Member ID</th>
                  <th>Package</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {stats.recentMembers.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="empty-table">
                      No members registered yet. Add your first
                      member to get started.
                    </td>
                  </tr>
                ) : (
                  stats.recentMembers.map((member) => {
                    const status = getMemberStatus(member);

                    return (
                      <tr key={member.id}>
                        <td>{memberName(member)}</td>

                        <td>
                          {member.memberId || member.id}
                        </td>

                        <td>
                          {member.packageName ||
                            member.package ||
                            member.packageId ||
                            "—"}
                        </td>

                        <td>
                          <span
                            className={`status ${status
                              .toLowerCase()
                              .replace(/\s+/g, "-")}`}
                          >
                            {status}
                          </span>
                        </td>

                        <td>
                          <button
                            type="button"
                            className="remove-member-button"
                            title={`Remove ${memberName(member)}`}
                            aria-label={`Remove ${memberName(member)}`}
                            onClick={() => removeMember(member)}
                          >
                            <Trash2 size={15} />
                            <span>Remove</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* UPCOMING EXPIRATIONS */}

        <section className="dashboard-panel expiry-panel">
          <div className="panel-heading">
            <div>
              <h3>Upcoming Expirations</h3>
              <p>Memberships expiring in the next 7 days</p>
            </div>

            <CalendarClock size={19} color="#8993a4" />
          </div>

          {stats.upcoming.length === 0 ? (
            <p className="empty-expiry">
              No memberships expiring in the next 7 days.
            </p>
          ) : (
            stats.upcoming.map((member) => {
              const days = Math.max(
                0,
                Math.ceil(
                  (member.expiry - new Date()) / 86400000
                )
              );

              return (
                <div className="expiry-item" key={member.id}>
                  <div>
                    <strong>{memberName(member)}</strong>

                    <small>
                      {days === 0
                        ? "Expires today"
                        : `Expires in ${days} day${days === 1 ? "" : "s"
                        }`}
                    </small>
                  </div>

                  <span className="expiry-date">
                    {member.expiry.toLocaleDateString(
                      undefined,
                      {
                        day: "2-digit",
                        month: "short",
                      }
                    )}
                  </span>
                </div>
              );
            })
          )}
        </section>
      </div>
    </div>
  );
}
