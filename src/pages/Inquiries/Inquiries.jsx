import { useEffect, useMemo, useState } from "react";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";

import { auth, db } from "../../firebase/config";

import {
  Plus,
  Search,
  Trash2,
  X,
  MessageSquare,
  Phone,
  Mail,
  CheckCircle2,
  MessageCircle,
  UserRound,
  UserPlus,
} from "lucide-react";

// Inquiries: people asking about the gym. The owner records the
// inquiry, follows up (WhatsApp / status), and converts it into a
// member with one tap. No backend needed — Firestore-direct, like
// the rest of the app.

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

const STATUS_LABELS = {
  new: "New",
  contacted: "Contacted",
  converted: "Converted",
  closed: "Closed",
};

export default function Inquiries() {
  const user = auth.currentUser;

  const [inquiries, setInquiries] = useState([]);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(() => Boolean(user?.uid));
  const [error, setError] = useState(() =>
    user?.uid ? "" : "Please log in to view inquiries."
  );
  const [notice, setNotice] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [convertingId, setConvertingId] = useState("");

  const emptyForm = {
    name: "",
    phone: "",
    email: "",
    planId: "",
    message: "",
  };

  const [formData, setFormData] = useState(emptyForm);

  // LOAD INQUIRIES AND PLANS FROM FIRESTORE

  useEffect(() => {
    if (!user?.uid) return;

    const byOwner = (name) =>
      query(collection(db, name), where("ownerId", "==", user.uid));

    const unsubInquiries = onSnapshot(
      byOwner("inquiries"),
      (snapshot) => {
        const data = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        }));
        // Newest first.
        data.sort(
          (a, b) =>
            (asDate(b.createdAt)?.getTime() || 0) -
            (asDate(a.createdAt)?.getTime() || 0)
        );
        setInquiries(data);
        setLoading(false);
        setError("");
      },
      (err) => {
        console.error("Inquiries loading error:", err);
        setError("Unable to load inquiries. Check your Firestore rules.");
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
      unsubInquiries();
      unsubPlans();
    };
  }, [user?.uid]);

  const activePlans = useMemo(
    () =>
      plans.filter((plan) => (plan.status || "active") === "active"),
    [plans]
  );

  // SEARCH + STATUS FILTER

  const filteredInquiries = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return inquiries.filter((inquiry) => {
      if (statusFilter !== "all" && inquiry.status !== statusFilter) {
        return false;
      }
      if (!keyword) return true;
      return [
        inquiry.name,
        inquiry.phone,
        inquiry.email,
        inquiry.message,
        inquiry.planName,
      ].some((value) =>
        String(value || "").toLowerCase().includes(keyword)
      );
    });
  }, [inquiries, search, statusFilter]);

  const newCount = useMemo(
    () => inquiries.filter((inquiry) => inquiry.status === "new").length,
    [inquiries]
  );

  // ADD INQUIRY

  const openAddForm = () => {
    setFormData(emptyForm);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setFormData(emptyForm);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((previous) => ({ ...previous, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!user?.uid) {
      setError("You must be logged in.");
      return;
    }

    if (!formData.name.trim() || !formData.phone.trim()) {
      setError("Name and phone number are required.");
      return;
    }

    setSaving(true);
    setError("");

    const chosenPlan =
      activePlans.find((plan) => plan.id === formData.planId) ||
      plans.find((plan) => plan.id === formData.planId) ||
      null;

    try {
      await addDoc(collection(db, "inquiries"), {
        name: formData.name.trim(),
        phone: formData.phone.trim(),
        email: formData.email.trim(),
        message: formData.message.trim(),
        planId: chosenPlan ? chosenPlan.id : "",
        planName: chosenPlan ? chosenPlan.name : "",
        status: "new",
        ownerId: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setShowForm(false);
      setFormData(emptyForm);
      setNotice("Inquiry added.");
    } catch (err) {
      console.error("Saving inquiry failed:", err);
      setError(err.message || "Unable to save inquiry.");
    } finally {
      setSaving(false);
    }
  };

  // CHANGE STATUS

  const setStatus = async (inquiry, status) => {
    try {
      await updateDoc(doc(db, "inquiries", inquiry.id), {
        status,
        updatedAt: serverTimestamp(),
      });
      setError("");
    } catch (err) {
      console.error("Updating inquiry failed:", err);
      setError("Unable to update inquiry.");
    }
  };

  // CONVERT TO MEMBER

  const convertToMember = async (inquiry) => {
    if (!user?.uid) {
      setError("You must be logged in.");
      return;
    }

    setConvertingId(inquiry.id);
    setError("");

    try {
      // No memberId here on purpose: the Members page gives every
      // member without one the next GYM-### number automatically.
      await addDoc(collection(db, "members"), {
        fullName: inquiry.name || "",
        email: inquiry.email || "",
        phone: inquiry.phone || "",
        role: "member",
        planId: inquiry.planId || "",
        planName: inquiry.planName || "",
        ownerId: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await updateDoc(doc(db, "inquiries", inquiry.id), {
        status: "converted",
        updatedAt: serverTimestamp(),
      });

      setNotice(
        `${inquiry.name || "Inquiry"} converted to a member.`
      );
    } catch (err) {
      console.error("Converting inquiry failed:", err);
      setError(err.message || "Unable to convert inquiry.");
    } finally {
      setConvertingId("");
    }
  };

  // WHATSAPP FOLLOW-UP

  const contactOnWhatsApp = (inquiry) => {
    const waNumber = toWaNumber(inquiry.phone);
    if (!waNumber) {
      setError(
        `${inquiry.name || "This inquiry"} has no phone number saved.`
      );
      return;
    }
    const message =
      `Hi ${inquiry.name || ""}! Thanks for reaching out to ` +
      `GymNexus${inquiry.planName ? ` about the ${inquiry.planName} plan` : ""}. ` +
      `How can we help you?`;
    window.open(
      `https://wa.me/${waNumber}?text=${encodeURIComponent(message)}`,
      "_blank",
      "noopener"
    );
  };

  // DELETE INQUIRY

  const handleDelete = async (inquiry) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete the inquiry from ${
        inquiry.name || "this person"
      }?`
    );
    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, "inquiries", inquiry.id));
      setError("");
    } catch (err) {
      console.error("Deleting inquiry failed:", err);
      setError("Unable to delete inquiry. Check Firestore permissions.");
    }
  };

  return (
    <div className="members-page">
      <div className="members-header">
        <div>
          <h2>Inquiries</h2>
          <p>Track and follow up on gym inquiries.</p>
        </div>

        <button
          type="button"
          className="add-button"
          onClick={openAddForm}
        >
          <Plus size={18} />
          Add Inquiry
        </button>
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

      {/* TOOLBAR */}

      <div className="members-toolbar">
        <div className="members-search-wrapper">
          <Search size={16} />

          <input
            type="text"
            className="members-search"
            placeholder="Search by name, phone or message..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <select
          className="status-filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter by status"
        >
          <option value="all">All statuses</option>
          <option value="new">New</option>
          <option value="contacted">Contacted</option>
          <option value="converted">Converted</option>
          <option value="closed">Closed</option>
        </select>

        <div className="members-count">
          <MessageSquare size={18} />
          Total: <strong>{inquiries.length}</strong>
          {newCount > 0 && (
            <>
              {" · "}New: <strong>{newCount}</strong>
            </>
          )}
        </div>
      </div>

      {/* INQUIRIES LIST */}

      {loading ? (
        <div className="members-empty">Loading inquiries...</div>
      ) : filteredInquiries.length === 0 ? (
        <div className="members-empty">
          <MessageSquare size={40} />

          <h3>
            {search || statusFilter !== "all"
              ? "No matching inquiries"
              : "No inquiries yet"}
          </h3>

          <p>
            {search || statusFilter !== "all"
              ? "Try a different search or status."
              : "Add your first inquiry to start tracking follow-ups."}
          </p>

          {!search && statusFilter === "all" && (
            <button
              type="button"
              className="add-button"
              onClick={openAddForm}
            >
              <Plus size={17} />
              Add First Inquiry
            </button>
          )}
        </div>
      ) : (
        <div className="members-list">
          {filteredInquiries.map((inquiry) => {
            const status = inquiry.status || "new";
            return (
              <div className="member-card" key={inquiry.id}>
                <div className="member-card-top">
                  <div className="member-avatar">
                    {(inquiry.name || "I").charAt(0).toUpperCase()}
                  </div>

                  <span
                    className={`payment-status inquiry-${status}`}
                  >
                    {STATUS_LABELS[status] || "New"}
                  </span>
                </div>

                <h3>{inquiry.name || "Unnamed"}</h3>

                <p>
                  <Phone size={15} />
                  {inquiry.phone || "No phone"}
                </p>

                {inquiry.email && (
                  <p>
                    <Mail size={15} />
                    {inquiry.email}
                  </p>
                )}

                {inquiry.planName && (
                  <p>
                    <UserRound size={15} />
                    Interested in: {inquiry.planName}
                  </p>
                )}

                {inquiry.message && (
                  <p className="inquiry-message">
                    “{inquiry.message}”
                  </p>
                )}

                <p className="inquiry-date">
                  {formatDate(inquiry.createdAt)}
                </p>

                <div className="member-actions">
                  <button
                    type="button"
                    className="reminder-send-btn"
                    onClick={() => contactOnWhatsApp(inquiry)}
                  >
                    <MessageCircle size={15} />
                    WhatsApp
                  </button>

                  {status === "new" && (
                    <button
                      type="button"
                      className="modal-close-btn"
                      onClick={() => setStatus(inquiry, "contacted")}
                    >
                      Contacted
                    </button>
                  )}

                  {(status === "new" || status === "contacted") && (
                    <button
                      type="button"
                      className="mark-paid-btn"
                      onClick={() => convertToMember(inquiry)}
                      disabled={convertingId === inquiry.id}
                    >
                      <UserPlus size={15} />
                      {convertingId === inquiry.id
                        ? "Converting..."
                        : "Convert to member"}
                    </button>
                  )}

                  {(status === "new" || status === "contacted") && (
                    <button
                      type="button"
                      className="modal-close-btn"
                      onClick={() => setStatus(inquiry, "closed")}
                    >
                      Close
                    </button>
                  )}

                  <button
                    type="button"
                    className="delete-member-btn"
                    onClick={() => handleDelete(inquiry)}
                    aria-label="Delete inquiry"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ADD INQUIRY MODAL */}

      {showForm && (
        <div
          className="member-modal-overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeForm();
          }}
        >
          <div className="member-modal">
            <div className="member-modal-header">
              <div>
                <h2>Add New Inquiry</h2>
                <p>Enter the person&apos;s details.</p>
              </div>

              <button
                type="button"
                className="member-modal-close"
                onClick={closeForm}
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="member-form">
              <label htmlFor="inquiry-name">Full Name</label>

              <input
                id="inquiry-name"
                name="name"
                type="text"
                placeholder="Enter full name"
                value={formData.name}
                onChange={handleChange}
                required
              />

              <label htmlFor="inquiry-phone">Phone Number</label>

              <input
                id="inquiry-phone"
                name="phone"
                type="tel"
                placeholder="Enter phone number"
                value={formData.phone}
                onChange={handleChange}
                required
              />

              <label htmlFor="inquiry-email">Email Address</label>

              <input
                id="inquiry-email"
                name="email"
                type="email"
                placeholder="Enter email address (optional)"
                value={formData.email}
                onChange={handleChange}
              />

              <label htmlFor="inquiry-plan">Interested Plan</label>

              <select
                id="inquiry-plan"
                name="planId"
                value={formData.planId}
                onChange={handleChange}
              >
                <option value="">No specific plan</option>
                {activePlans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name} — {plan.duration}{" "}
                    {Number(plan.duration) === 1 ? "month" : "months"}
                    {plan.price !== undefined && plan.price !== null
                      ? ` (Rs. ${plan.price})`
                      : ""}
                  </option>
                ))}
              </select>

              {plans.length === 0 && (
                <p className="member-form-hint">
                  No plans yet — create one in Plans first.
                </p>
              )}

              <label htmlFor="inquiry-message">Message</label>

              <textarea
                id="inquiry-message"
                name="message"
                placeholder="What are they asking about? (optional)"
                value={formData.message}
                onChange={handleChange}
                rows={3}
              />

              <div className="member-form-actions">
                <button
                  type="button"
                  className="modal-close-btn"
                  onClick={closeForm}
                  disabled={saving}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="modal-save-btn"
                  disabled={saving}
                >
                  {saving ? "Saving..." : "Save Inquiry"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
