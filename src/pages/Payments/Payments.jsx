import { useEffect, useMemo, useRef, useState } from "react";

import {
  addDoc,
  collection,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  doc,
  where,
} from "firebase/firestore";

import { auth, db } from "../../firebase/config";

import {
  ArrowLeft,
  Search,
  Wallet,
  X,
  Bell,
  MessageCircle,
  CheckCircle2,
} from "lucide-react";

// Payments page (no backend needed): the owner simply marks each
// member's payment done or not done for the current month. Marking a
// payment done also extends the membership by one month, so the
// expiry reminders below keep working. Reminders go out over WhatsApp
// from the owner's own phone — one tap opens the chat with the message
// ready to send.

const asDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === "function") return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDate = (value) => {
  const date = asDate(value);
  if (!date) return "—";
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

const toWaNumber = (phone) => {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("92")) return digits;
  if (digits.startsWith("0")) return `92${digits.slice(1)}`;
  return digits;
};

const buildReminderMessage = (member, expiry, senderName) =>
  `Hi ${member.fullName || member.name || "member"}! This is a reminder ` +
  `from ${senderName || "your gym"} — your ` +
  `${member.planName ? `${member.planName} plan ` : ""}membership expires on ${expiry.toLocaleDateString(
    "en-GB",
    { day: "numeric", month: "long", year: "numeric" }
  )}. Please visit the gym or reply to this message to renew and keep ` +
  `training. Thank you!`;

const monthKey = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

const monthLabel = (date = new Date()) =>
  date.toLocaleDateString("en-GB", { month: "long", year: "numeric" });

export default function Payments({ onNavigate, ownerProfile }) {
  const user = auth.currentUser;

  const [members, setMembers] = useState([]);
  const [payments, setPayments] = useState([]);
  const [plans, setPlans] = useState([]);
  const repairedPayments = useRef(new Set());
  const [loading, setLoading] = useState(() => Boolean(user?.uid));
  const [error, setError] = useState(() =>
    user?.uid ? "" : "Please log in to view payments."
  );
  const [notice, setNotice] = useState("");

  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState("");
  const [sendingId, setSendingId] = useState("");

  const currentMonth = monthKey();

  // LOAD MEMBERS AND PAYMENTS FROM FIRESTORE

  useEffect(() => {
    if (!user?.uid) return;

    const byOwner = (name) =>
      query(collection(db, name), where("ownerId", "==", user.uid));

    const unsubMembers = onSnapshot(
      byOwner("members"),
      (snapshot) => {
        const data = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        }));
        // Same order as the Members page: oldest first, so a newly
        // added member goes to the bottom of the list.
        data.sort((a, b) => {
          const aTime = asDate(a.createdAt)?.getTime() || Date.now();
          const bTime = asDate(b.createdAt)?.getTime() || Date.now();
          if (aTime !== bTime) return aTime - bTime;
          return String(a.fullName || a.name || "").localeCompare(
            String(b.fullName || b.name || "")
          );
        });
        setMembers(data);
      },
      (err) => {
        console.error("Members loading error:", err);
        setError("Unable to load members. Check your Firestore rules.");
      }
    );

    const unsubPayments = onSnapshot(
      byOwner("payments"),
      (snapshot) => {
        setPayments(
          snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
        );
        setLoading(false);
        setError("");
      },
      (err) => {
        console.error("Payments loading error:", err);
        setError("Unable to load payments. Check your Firestore rules.");
        setLoading(false);
      }
    );

    const unsubPlans = onSnapshot(
      byOwner("membershipPlans"),
      (snapshot) => {
        setPlans(
          snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
        );
      },
      (err) => {
        console.error("Plans loading error:", err);
      }
    );

    return () => {
      unsubMembers();
      unsubPayments();
      unsubPlans();
    };
  }, [user?.uid]);

  // The price of the plan a member is on (by id, falling back to the
  // stored plan name). Used for the payment amount.
  const planForMember = (member) => {
    if (!member) return null;
    return (
      plans.find((plan) => plan.id === member.planId) ||
      plans.find((plan) => plan.name === member.planName) ||
      null
    );
  };

  // One-time repair: older paid records were saved without an amount
  // (the old "just mark paid" flow). Fill it in from the member's
  // plan price so the notification shows the real amount. Each
  // record is attempted once; afterwards it already has an amount.
  useEffect(() => {
    if (!user?.uid || plans.length === 0) return;

    for (const payment of payments) {
      if (payment.status !== "paid") continue;
      if (Number(payment.amount || payment.paidAmount || 0) > 0) continue;
      if (repairedPayments.current.has(payment.id)) continue;

      const member = members.find((m) => m.id === payment.memberId);
      const plan = planForMember(member) ||
        plans.find((item) => item.id === payment.planId) ||
        plans.find((item) => item.name === payment.planName);
      if (!plan || !(Number(plan.price) > 0)) continue;

      repairedPayments.current.add(payment.id);
      updateDoc(doc(db, "payments", payment.id), {
        amount: Number(plan.price),
        planId: plan.id,
        planName: plan.name,
        updatedAt: serverTimestamp(),
      }).catch((err) =>
        console.error("Backfilling payment amount failed:", err)
      );
    }
  }, [payments, members, plans, user?.uid]);

  // THIS MONTH'S PAYMENT STATUS PER MEMBER

  const paymentByMember = useMemo(() => {
    const map = {};
    for (const payment of payments) {
      if (payment.month === currentMonth) {
        map[payment.memberId] = payment;
      }
    }
    return map;
  }, [payments, currentMonth]);

  const paidCount = useMemo(
    () =>
      members.filter(
        (member) => paymentByMember[member.id]?.status === "paid"
      ).length,
    [members, paymentByMember]
  );

  // MEMBERS WHOSE MEMBERSHIP EXPIRES WITHIN 2 DAYS

  const expiringSoon = useMemo(() => {
    const now = new Date();
    return members
      .map((member) => {
        const expiry = asDate(
          member.membershipExpiryDate || member.expiryDate
        );
        if (!expiry) return null;
        const daysLeft = Math.ceil((expiry - now) / 86400000);
        if (daysLeft < 0 || daysLeft > 2) return null;
        return { ...member, expiry, daysLeft };
      })
      .filter(Boolean)
      .sort((a, b) => a.daysLeft - b.daysLeft);
  }, [members]);

  // SEARCH MEMBERS

  const filteredMembers = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return members;
    return members.filter((member) =>
      [member.fullName, member.name, member.email, member.phone]
        .some((value) => String(value || "").toLowerCase().includes(keyword))
    );
  }, [members, search]);

  // MARK PAYMENT PAID FOR THIS MONTH — ONE-WAY.
  // A confirmation is asked first, and once a payment is marked
  // paid it cannot be changed back to not paid, even by the owner.

  const markPaid = async (member) => {
    if (!user?.uid) {
      setError("You must be logged in.");
      return;
    }
    const existing = paymentByMember[member.id];
    if (existing?.status === "paid") return;

    const plan = planForMember(member);
    const amount =
      plan && Number(plan.price) > 0 ? Number(plan.price) : null;
    const confirmed = window.confirm(
      `Mark ${member.fullName || member.name || "this member"} as paid for ${monthLabel()}` +
        (amount !== null
          ? ` (Rs. ${amount.toLocaleString("en-IN")})`
          : "") +
        `? Once marked paid, this cannot be changed.`
    );
    if (!confirmed) return;

    setSavingId(member.id);
    setError("");

    try {
      // Record the payment (with the price of the member's plan
      // as the amount) and extend the membership by one month
      // (from the current expiry if it is still in the future,
      // otherwise from today).
      const now = new Date();
      const currentExpiry = asDate(
        member.membershipExpiryDate || member.expiryDate
      );
      const start = currentExpiry && currentExpiry > now ? currentExpiry : now;
      const newExpiry = new Date(start);
      newExpiry.setMonth(newExpiry.getMonth() + 1);

      const paymentDetails = {
        status: "paid",
        paidAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        ...(amount !== null
          ? {
              amount,
              planId: plan.id,
              planName: plan.name,
            }
          : {}),
      };

      if (existing) {
        await updateDoc(doc(db, "payments", existing.id), paymentDetails);
      } else {
        await addDoc(collection(db, "payments"), {
          ownerId: user.uid,
          memberId: member.id,
          memberName: member.fullName || member.name || "",
          month: currentMonth,
          ...paymentDetails,
          createdAt: serverTimestamp(),
        });
      }

      await updateDoc(doc(db, "members", member.id), {
        membershipExpiryDate: newExpiry.toISOString(),
        membershipStatus: "active",
        updatedAt: serverTimestamp(),
      });

      setNotice(
        `${member.fullName || "Member"} marked as paid for ${monthLabel()}${
          amount !== null ? ` — Rs. ${amount.toLocaleString("en-IN")}` : ""
        } — membership now runs until ${formatDate(newExpiry)}.`
      );
    } catch (err) {
      console.error("Updating payment failed:", err);
      setError(err.message || "Unable to update payment.");
    } finally {
      setSavingId("");
    }
  };

  // SEND EXPIRY REMINDER OVER WHATSAPP

  const sendReminder = async (member) => {
    const waNumber = toWaNumber(member.phone);
    if (!waNumber) {
      setError(
        `${member.fullName || "This member"} has no phone number saved.`
      );
      return;
    }
    const ownerName =
      ownerProfile?.gymName ||
      ownerProfile?.fullName ||
      user?.displayName ||
      "";
    const message = buildReminderMessage(member, member.expiry, ownerName);
    const whatsappUrl = `https://wa.me/${waNumber}?text=${encodeURIComponent(message)}`;

    setSendingId(member.id);
    setError("");
    try {
      // Record that the reminder was sent, so it is not sent twice.
      await addDoc(collection(db, "reminders"), {
        ownerId: user.uid,
        memberId: member.id,
        memberName: member.fullName || member.name || "",
        phone: member.phone || "",
        channel: "whatsapp",
        message,
        expiryDate: member.expiry.toISOString(),
        sentAt: serverTimestamp(),
        sentBy: "manual",
      });
      await updateDoc(doc(db, "members", member.id), {
        lastReminderSentAt: serverTimestamp(),
      });
      setNotice(
        `Reminder ready for ${member.fullName || "member"} — WhatsApp is opening with the message.`
      );
      window.open(whatsappUrl, "_blank", "noopener");
    } catch (err) {
      console.error("Reminder failed:", err);
      setError("Could not record the reminder. Opening WhatsApp anyway.");
      window.open(whatsappUrl, "_blank", "noopener");
    } finally {
      setSendingId("");
    }
  };

  const remindedToday = (member) => {
    const sentAt = asDate(member.lastReminderSentAt);
    if (!sentAt) return false;
    const now = new Date();
    return sentAt.toDateString() === now.toDateString();
  };

  return (
    <div className="members-page">

      <button
        type="button"
        className="back-button"
        onClick={() => onNavigate?.("dashboard")}
      >
        <ArrowLeft size={17} />
        Back
      </button>
      <div className="members-header">
        <div>
          <h2>Payments — {monthLabel()}</h2>
          <p>Mark each member's payment done or not done.</p>
        </div>
      </div>

      {error && (
        <div className="members-error">
          {error}
          <button
            type="button"
            onClick={() => setError("")}
            aria-label="Dismiss error"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {notice && (
        <div className="members-notice">
          <CheckCircle2 size={16} />
          {notice}
          <button
            type="button"
            onClick={() => setNotice("")}
            aria-label="Dismiss notice"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* EXPIRING IN 2 DAYS */}

      <div className="reminder-panel">
        <div className="reminder-panel-heading">
          <Bell size={18} />
          <h3>Expiring in 2 days</h3>
          <span className="reminder-count">{expiringSoon.length}</span>
        </div>

        {expiringSoon.length === 0 ? (
          <p className="reminder-empty">
            No memberships expire in the next 2 days.
          </p>
        ) : (
          <div className="reminder-list">
            {expiringSoon.map((member) => (
              <div className="reminder-row" key={member.id}>
                <div>
                  <strong>{member.fullName || member.name || "Unnamed"}</strong>
                  <span>
                    Expires {formatDate(member.expiry)} ·{" "}
                    {member.daysLeft === 0
                      ? "today"
                      : member.daysLeft === 1
                      ? "tomorrow"
                      : `in ${member.daysLeft} days`}
                  </span>
                </div>
                <button
                  type="button"
                  className="reminder-send-btn"
                  onClick={() => sendReminder(member)}
                  disabled={sendingId === member.id}
                >
                  <MessageCircle size={15} />
                  {remindedToday(member)
                    ? "Reminder sent today"
                    : sendingId === member.id
                    ? "Sending..."
                    : "Send reminder"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* TOOLBAR */}

      <div className="members-toolbar">
        <div className="members-search-wrapper">
          <Search size={16} />
          <input
            type="text"
            className="members-search"
            placeholder="Search members by name or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="members-count">
          <Wallet size={18} />
          Paid: <strong>{paidCount} / {members.length}</strong>
        </div>
      </div>

      {/* MEMBERS PAYMENT LIST */}

      {loading ? (
        <div className="members-empty">Loading payments...</div>
      ) : filteredMembers.length === 0 ? (
        <div className="members-empty">
          <Wallet size={40} />
          <h3>{search ? "No matching members" : "No members yet"}</h3>
          <p>
            {search
              ? "Try searching with another name."
              : "Add members first, then mark their payments here."}
          </p>
        </div>
      ) : (
        <div className="members-list">
          {filteredMembers.map((member) => {
            const isPaid =
              paymentByMember[member.id]?.status === "paid";
            return (
              <div className="member-card payment-card" key={member.id}>
                <div className="member-card-top">
                  <div className="member-avatar">
                    {(member.fullName || member.name || "M")
                      .charAt(0)
                      .toUpperCase()}
                  </div>
                  <span
                    className={`payment-status ${
                      isPaid ? "payment-paid" : "payment-pending"
                    }`}
                  >
                    {isPaid ? "Paid" : "Not paid"}
                  </span>
                </div>

                <h3>{member.fullName || member.name || "Unnamed"}</h3>

                <p>Plan: {member.planName || "No plan"}</p>

                <p>
                  Membership ends {formatDate(
                    member.membershipExpiryDate || member.expiryDate
                  )}
                </p>

                <div className="member-actions">
                  <button
                    type="button"
                    className={
                      isPaid ? "payment-locked-btn" : "mark-paid-btn"
                    }
                    onClick={() => markPaid(member)}
                    disabled={isPaid || savingId === member.id}
                    title={
                      isPaid
                        ? "Paid payments cannot be changed"
                        : undefined
                    }
                  >
                    {savingId === member.id ? (
                      "Saving..."
                    ) : isPaid ? (
                      <>
                        <CheckCircle2 size={15} />
                        Paid
                      </>
                    ) : (
                      "Mark paid"
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
