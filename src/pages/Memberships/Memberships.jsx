
import { useEffect, useMemo, useState } from "react";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  updateDoc,
  where,
  serverTimestamp,
} from "firebase/firestore";

import { auth, db } from "../../firebase/config";

import {
  ArrowLeft,
  Plus,
  Search,
  Eye,
  Pencil,
  Trash2,
  X,
  Package,
  Clock,
  CheckCircle,
  Power,
} from "lucide-react";

export default function Memberships({ onNavigate }) {
  const user = auth.currentUser;

  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(() => Boolean(user?.uid));
  const [error, setError] = useState(() =>
    user?.uid ? "" : "Please log in to manage membership plans."
  );
  const [search, setSearch] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [editingPlan, setEditingPlan] = useState(null);
  const [saving, setSaving] = useState(false);

  const emptyForm = {
    name: "",
    duration: "1",
    price: "",
    description: "",
    status: "active",
  };

  const [formData, setFormData] = useState(emptyForm);

  // LOAD PLANS

  useEffect(() => {
    if (!user?.uid) {
      return undefined;
    }

    const plansQuery = query(
      collection(db, "membershipPlans"),
      where("ownerId", "==", user.uid)
    );

    const unsubscribe = onSnapshot(
      plansQuery,
      (snapshot) => {
        const data = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        }));

        data.sort((a, b) =>
          String(a.name || "").localeCompare(String(b.name || ""))
        );

        setPlans(data);
        setLoading(false);
        setError("");
      },
      (err) => {
        console.error("Plans loading error:", err);
        setError("Unable to load membership plans.");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user?.uid]);

  // SEARCH

  const filteredPlans = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    if (!keyword) return plans;

    return plans.filter((plan) =>
      [
        plan.name,
        plan.description,
        plan.duration,
        plan.price,
        plan.status,
      ].some((value) =>
        String(value || "").toLowerCase().includes(keyword)
      )
    );
  }, [plans, search]);

  // OPEN ADD FORM

  const openAddForm = () => {
    setEditingPlan(null);
    setFormData(emptyForm);
    setShowForm(true);
    setSelectedPlan(null);
  };

  // OPEN EDIT FORM

  const openEditForm = (plan) => {
    setEditingPlan(plan);

    setFormData({
      name: plan.name || "",
      duration: String(plan.duration || "1"),
      price: String(plan.price ?? ""),
      description: plan.description || "",
      status: plan.status || "active",
    });

    setSelectedPlan(null);
    setShowForm(true);
  };

  // INPUT HANDLER

  const handleChange = (e) => {
    const { name, value } = e.target;

    setFormData((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  // ADD OR UPDATE PLAN

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!user?.uid) {
      setError("Please log in first.");
      return;
    }

    if (!formData.name.trim() || formData.price === "") {
      setError("Plan name and price are required.");
      return;
    }

    const price = Number(formData.price);
    const duration = Number(formData.duration);

    if (!Number.isFinite(price) || price < 0) {
      setError("Enter a valid plan price.");
      return;
    }

    if (!Number.isInteger(duration) || duration < 1) {
      setError("Enter a valid plan duration.");
      return;
    }

    setSaving(true);
    setError("");

    const planData = {
      name: formData.name.trim(),
      duration,
      durationUnit: "months",
      price,
      description: formData.description.trim(),
      status: formData.status,
      updatedAt: serverTimestamp(),
    };

    try {
      if (editingPlan) {
        await updateDoc(
          doc(db, "membershipPlans", editingPlan.id),
          planData
        );
      } else {
        await addDoc(collection(db, "membershipPlans"), {
          ...planData,
          ownerId: user.uid,
          createdAt: serverTimestamp(),
        });
      }

      setShowForm(false);
      setEditingPlan(null);
      setFormData(emptyForm);
    } catch (err) {
      console.error("Saving plan failed:", err);
      setError(err.message || "Unable to save membership plan.");
    } finally {
      setSaving(false);
    }
  };

  // DELETE PLAN

  const handleDelete = async (plan) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${plan.name}"?`
    );

    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, "membershipPlans", plan.id));
      setSelectedPlan(null);
      setError("");
    } catch (err) {
      console.error("Deleting plan failed:", err);
      setError("Unable to delete membership plan.");
    }
  };

  // TOGGLE STATUS

  const toggleStatus = async (plan) => {
    const newStatus =
      plan.status === "active" ? "inactive" : "active";

    try {
      await updateDoc(
        doc(db, "membershipPlans", plan.id),
        {
          status: newStatus,
          updatedAt: serverTimestamp(),
        }
      );

      setSelectedPlan((current) =>
        current?.id === plan.id
          ? { ...current, status: newStatus }
          : current
      );
    } catch (err) {
      console.error("Status update failed:", err);
      setError("Unable to change plan status.");
    }
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingPlan(null);
    setFormData(emptyForm);
  };

  const formatPrice = (price) =>
    `Rs. ${Number(price || 0).toLocaleString("en-PK")}`;

  const durationLabel = (duration) =>
    `${duration} ${Number(duration) === 1 ? "Month" : "Months"}`;

  return (
    <div className="memberships-page">

      <button
        type="button"
        className="back-button"
        onClick={() => onNavigate?.("dashboard")}
      >
        <ArrowLeft size={17} />
        Back
      </button>

      {/* HEADER */}

      <div className="memberships-header">
        <div>
          <h2>Membership Plans</h2>
          <p>Create and manage your gym subscription plans.</p>
        </div>

        <button
          type="button"
          className="membership-add-button"
          onClick={openAddForm}
        >
          <Plus size={18} />
          Add New Plan
        </button>
      </div>

      {/* ERROR */}

      {error && (
        <div className="membership-error">
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

      {/* STATISTICS */}

      <div className="membership-stats">
        <div className="membership-stat-card">
          <Package size={22} />
          <div>
            <span>Total Plans</span>
            <h3>{plans.length}</h3>
          </div>
        </div>

        <div className="membership-stat-card">
          <CheckCircle size={22} />
          <div>
            <span>Active Plans</span>
            <h3>
              {plans.filter((p) => p.status === "active").length}
            </h3>
          </div>
        </div>

        <div className="membership-stat-card">
          <Power size={22} />
          <div>
            <span>Inactive Plans</span>
            <h3>
              {plans.filter((p) => p.status === "inactive").length}
            </h3>
          </div>
        </div>
      </div>

      {/* SEARCH */}

      <div className="memberships-toolbar">
        <div className="membership-search">
          <Search size={18} />

          <input
            type="text"
            placeholder="Search membership plans..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <span>
          Showing <strong>{filteredPlans.length}</strong> plans
        </span>
      </div>

      {/* PLANS */}

      {loading ? (
        <div className="membership-empty">Loading plans...</div>
      ) : filteredPlans.length === 0 ? (
        <div className="membership-empty">
          <Package size={42} />
          <h3>No Membership Plans Found</h3>
          <p>Create your first gym membership plan.</p>

          {!search && (
            <button
              className="membership-add-button"
              onClick={openAddForm}
            >
              <Plus size={17} />
              Create First Plan
            </button>
          )}
        </div>
      ) : (
        <div className="membership-grid">
          {filteredPlans.map((plan) => (
            <div className="membership-card" key={plan.id}>

              <div className="membership-card-top">
                <div className="membership-plan-icon">
                  <Package size={23} />
                </div>

                <span
                  className={`membership-status ${plan.status}`}
                >
                  {plan.status || "inactive"}
                </span>
              </div>

              <h3>{plan.name}</h3>

              <div className="membership-price">
                {formatPrice(plan.price)}
                <span>/ {durationLabel(plan.duration)}</span>
              </div>

              <div className="membership-duration">
                <Clock size={16} />
                {durationLabel(plan.duration)}
              </div>

              <p className="membership-description">
                {plan.description || "No description provided."}
              </p>

              <div className="membership-card-actions">

                <button
                  className="membership-view-button"
                  onClick={() => setSelectedPlan(plan)}
                >
                  <Eye size={15} />
                  View Details
                </button>

                <button
                  className="membership-edit-button"
                  onClick={() => openEditForm(plan)}
                  aria-label="Edit plan"
                >
                  <Pencil size={15} />
                </button>

                <button
                  className="membership-delete-button"
                  onClick={() => handleDelete(plan)}
                  aria-label="Delete plan"
                >
                  <Trash2 size={15} />
                </button>

              </div>
            </div>
          ))}
        </div>
      )}

      {/* ADD / EDIT MODAL */}

      {showForm && (
        <div
          className="membership-modal-overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeForm();
          }}
        >
          <div className="membership-modal">

            <div className="membership-modal-header">
              <div>
                <h2>
                  {editingPlan ? "Edit Membership Plan" : "Add Membership Plan"}
                </h2>
                <p>Enter your membership package details.</p>
              </div>

              <button
                className="membership-close"
                onClick={closeForm}
              >
                <X size={20} />
              </button>
            </div>

            <form
              className="membership-form"
              onSubmit={handleSubmit}
            >
              <label htmlFor="plan-name">Plan Name</label>

              <input
                id="plan-name"
                name="name"
                type="text"
                placeholder="e.g. Premium Plan"
                value={formData.name}
                onChange={handleChange}
                required
              />

              <label htmlFor="plan-duration">Duration</label>

              <select
                id="plan-duration"
                name="duration"
                value={formData.duration}
                onChange={handleChange}
              >
                <option value="1">1 Month</option>
                <option value="3">3 Months</option>
                <option value="6">6 Months</option>
                <option value="12">12 Months</option>
              </select>

              <label htmlFor="plan-price">Price (PKR)</label>

              <input
                id="plan-price"
                name="price"
                type="number"
                min="0"
                step="1"
                placeholder="Enter price"
                value={formData.price}
                onChange={handleChange}
                required
              />

              <label htmlFor="plan-description">Description</label>

              <textarea
                id="plan-description"
                name="description"
                placeholder="Describe your membership plan..."
                value={formData.description}
                onChange={handleChange}
                rows="3"
              />

              <label htmlFor="plan-status">Status</label>

              <select
                id="plan-status"
                name="status"
                value={formData.status}
                onChange={handleChange}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>

              <div className="membership-form-actions">
                <button
                  type="button"
                  className="membership-cancel"
                  onClick={closeForm}
                  disabled={saving}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="membership-save"
                  disabled={saving}
                >
                  {saving
                    ? "Saving..."
                    : editingPlan
                    ? "Update Plan"
                    : "Save Plan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VIEW DETAILS MODAL */}

      {selectedPlan && (
        <div
          className="membership-modal-overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setSelectedPlan(null);
            }
          }}
        >
          <div className="membership-modal">

            <div className="membership-modal-header">
              <div>
                <h2>Membership Details</h2>
                <p>Complete package information.</p>
              </div>

              <button
                className="membership-close"
                onClick={() => setSelectedPlan(null)}
              >
                <X size={20} />
              </button>
            </div>

            <div className="membership-details">

              <div className="membership-detail-icon">
                <Package size={30} />
              </div>

              <h3>{selectedPlan.name}</h3>

              <div className="membership-detail-price">
                {formatPrice(selectedPlan.price)}
              </div>

              <div className="membership-detail-row">
                <span>Duration</span>
                <strong>
                  {durationLabel(selectedPlan.duration)}
                </strong>
              </div>

              <div className="membership-detail-row">
                <span>Description</span>
                <strong>
                  {selectedPlan.description || "No description"}
                </strong>
              </div>

              <div className="membership-detail-row">
                <span>Status</span>
                <strong>{selectedPlan.status}</strong>
              </div>

            </div>

            <div className="membership-detail-actions">

              <button
                className="membership-edit-button"
                onClick={() => openEditForm(selectedPlan)}
              >
                <Pencil size={16} />
                Edit Plan
              </button>

              <button
                className="membership-toggle-button"
                onClick={() => toggleStatus(selectedPlan)}
              >
                <Power size={16} />
                {selectedPlan.status === "active"
                  ? "Deactivate"
                  : "Activate"}
              </button>

              <button
                className="membership-delete-button"
                onClick={() => handleDelete(selectedPlan)}
              >
                <Trash2 size={16} />
                Delete
              </button>

            </div>

          </div>
        </div>
      )}

    </div>
  );
}
