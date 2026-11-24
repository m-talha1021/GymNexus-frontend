
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
  Plus,
  Search,
  Eye,
  Pencil,
  Trash2,
  X,
  Users,
  Mail,
  Phone,
  ShieldCheck,
  UserRound,
} from "lucide-react";

export default function Members() {
  const user = auth.currentUser;

  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(() => Boolean(user?.uid));
  const [error, setError] = useState(() =>
    user?.uid ? "" : "Please log in to view members."
  );

  const [search, setSearch] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);
  const [editingMember, setEditingMember] = useState(null);
  const [saving, setSaving] = useState(false);

  const emptyForm = {
    fullName: "",
    email: "",
    phone: "",
    role: "member",
  };

  const [formData, setFormData] = useState(emptyForm);

  // LOAD MEMBERS FROM FIRESTORE

  useEffect(() => {
    if (!user?.uid) {
      return;
    }

    const membersQuery = query(
      collection(db, "members"),
      where("ownerId", "==", user.uid)
    );

    const unsubscribe = onSnapshot(
      membersQuery,
      (snapshot) => {
        const memberData = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        }));

        memberData.sort((a, b) =>
          String(a.fullName || a.name || "").localeCompare(
            String(b.fullName || b.name || "")
          )
        );

        setMembers(memberData);
        setLoading(false);
        setError("");
      },
      (err) => {
        console.error("Members loading error:", err);
        setError("Unable to load members. Check your Firestore rules.");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user?.uid]);

  // SEARCH MEMBERS

  const filteredMembers = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    if (!keyword) return members;

    return members.filter((member) => {
      const values = [
        member.fullName,
        member.name,
        member.email,
        member.phone,
        member.role,
      ];

      return values.some((value) =>
        String(value || "").toLowerCase().includes(keyword)
      );
    });
  }, [members, search]);

  // OPEN ADD FORM

  const openAddForm = () => {
    setEditingMember(null);
    setFormData(emptyForm);
    setShowForm(true);
    setSelectedMember(null);
  };

  // OPEN EDIT FORM

  const openEditForm = (member) => {
    setEditingMember(member);

    setFormData({
      fullName: member.fullName || member.name || "",
      email: member.email || "",
      phone: member.phone || "",
      role: member.role || "member",
    });

    setSelectedMember(null);
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

  // ADD OR UPDATE MEMBER

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!user?.uid) {
      setError("You must be logged in.");
      return;
    }

    if (!formData.fullName.trim() || !formData.email.trim()) {
      setError("Name and email are required.");
      return;
    }

    setSaving(true);
    setError("");

    const memberData = {
      fullName: formData.fullName.trim(),
      email: formData.email.trim(),
      phone: formData.phone.trim(),
      role: formData.role,
      updatedAt: serverTimestamp(),
    };

    try {
      if (editingMember) {
        await updateDoc(
          doc(db, "members", editingMember.id),
          memberData
        );
      } else {
        await addDoc(collection(db, "members"), {
          ...memberData,
          ownerId: user.uid,
          createdAt: serverTimestamp(),
        });
      }

      setShowForm(false);
      setEditingMember(null);
      setFormData(emptyForm);
    } catch (err) {
      console.error("Saving member failed:", err);
      setError(err.message || "Unable to save member.");
    } finally {
      setSaving(false);
    }
  };

  // DELETE MEMBER

  const handleDelete = async (member) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete ${
        member.fullName || member.name
      }?`
    );

    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, "members", member.id));

      setSelectedMember(null);
      setError("");
    } catch (err) {
      console.error("Deleting member failed:", err);
      setError("Unable to delete member. Check Firestore permissions.");
    }
  };

  // CLOSE MODALS

  const closeForm = () => {
    setShowForm(false);
    setEditingMember(null);
    setFormData(emptyForm);
  };

  return (
    <div className="members-page">

      {/* PAGE HEADER */}

      <div className="members-header">
        <div>
          <h2>Members</h2>
          <p>Manage and organize your gym members.</p>
        </div>

        <button
          type="button"
          className="add-button"
          onClick={openAddForm}
        >
          <Plus size={18} />
          Add Member
        </button>
      </div>

      {/* ERROR MESSAGE */}

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

      {/* TOOLBAR */}

      <div className="members-toolbar">

        <div className="members-search-wrapper">
          <Search size={18} />

          <input
            type="text"
            className="members-search"
            placeholder="Search by name, email or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="members-count">
          <Users size={18} />
          Total Members: <strong>{members.length}</strong>
        </div>

      </div>

      {/* MEMBERS LIST */}

      {loading ? (
        <div className="members-empty">
          Loading members...
        </div>
      ) : filteredMembers.length === 0 ? (
        <div className="members-empty">
          <Users size={40} />

          <h3>
            {search ? "No matching members" : "No members found"}
          </h3>

          <p>
            {search
              ? "Try searching with another name or email."
              : "Add your first gym member to get started."}
          </p>

          {!search && (
            <button
              type="button"
              className="add-button"
              onClick={openAddForm}
            >
              <Plus size={17} />
              Add First Member
            </button>
          )}
        </div>
      ) : (
        <div className="members-list">

          {filteredMembers.map((member) => (
            <div className="member-card" key={member.id}>

              <div className="member-card-top">
                <div className="member-avatar">
                  {(member.fullName || member.name || "M")
                    .charAt(0)
                    .toUpperCase()}
                </div>

                <span className="member-role">
                  {member.role || "member"}
                </span>
              </div>

              <h3>{member.fullName || member.name || "Unnamed"}</h3>

              <p>
                <Mail size={15} />
                {member.email || "No email"}
              </p>

              <p>
                <Phone size={15} />
                {member.phone || "No phone"}
              </p>

              <div className="member-actions">

                <button
                  type="button"
                  className="view-details-btn"
                  onClick={() => setSelectedMember(member)}
                >
                  <Eye size={15} />
                  View Details
                </button>

                <button
                  type="button"
                  className="edit-member-btn"
                  onClick={() => openEditForm(member)}
                  aria-label="Edit member"
                >
                  <Pencil size={15} />
                </button>

                <button
                  type="button"
                  className="delete-member-btn"
                  onClick={() => handleDelete(member)}
                  aria-label="Delete member"
                >
                  <Trash2 size={15} />
                </button>

              </div>
            </div>
          ))}

        </div>
      )}

      {/* ADD / EDIT MEMBER MODAL */}

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
                <h2>
                  {editingMember ? "Edit Member" : "Add New Member"}
                </h2>

                <p>
                  {editingMember
                    ? "Update member information."
                    : "Enter the new member's information."}
                </p>
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

              <label htmlFor="member-fullName">Full Name</label>

              <input
                id="member-fullName"
                name="fullName"
                type="text"
                placeholder="Enter full name"
                value={formData.fullName}
                onChange={handleChange}
                required
              />

              <label htmlFor="member-email">Email Address</label>

              <input
                id="member-email"
                name="email"
                type="email"
                placeholder="Enter email address"
                value={formData.email}
                onChange={handleChange}
                required
              />

              <label htmlFor="member-phone">Phone Number</label>

              <input
                id="member-phone"
                name="phone"
                type="tel"
                placeholder="Enter phone number"
                value={formData.phone}
                onChange={handleChange}
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
                  {saving
                    ? "Saving..."
                    : editingMember
                    ? "Update Member"
                    : "Save Member"}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* MEMBER DETAILS MODAL */}

      {selectedMember && (
        <div
          className="member-modal-overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setSelectedMember(null);
            }
          }}
        >
          <div className="member-modal">

            <div className="member-modal-header">
              <div>
                <h2>Member Details</h2>
                <p>Complete member information.</p>
              </div>

              <button
                type="button"
                className="member-modal-close"
                onClick={() => setSelectedMember(null)}
                aria-label="Close details"
              >
                <X size={20} />
              </button>
            </div>

            <div className="member-details-profile">
              <div className="member-details-avatar">
                {(selectedMember.fullName ||
                  selectedMember.name ||
                  "M")
                  .charAt(0)
                  .toUpperCase()}
              </div>

              <h3>
                {selectedMember.fullName ||
                  selectedMember.name ||
                  "Unnamed member"}
              </h3>

              <span>
                {selectedMember.role || "member"}
              </span>
            </div>

            <div className="member-details">

              <div className="member-detail-row">
                <span>
                  <UserRound size={16} />
                  Name
                </span>

                <strong>
                  {selectedMember.fullName ||
                    selectedMember.name ||
                    "N/A"}
                </strong>
              </div>

              <div className="member-detail-row">
                <span>
                  <Mail size={16} />
                  Email
                </span>

                <strong>
                  {selectedMember.email || "N/A"}
                </strong>
              </div>

              <div className="member-detail-row">
                <span>
                  <Phone size={16} />
                  Phone
                </span>

                <strong>
                  {selectedMember.phone || "N/A"}
                </strong>
              </div>

              <div className="member-detail-row">
                <span>
                  <ShieldCheck size={16} />
                  Role
                </span>

                <strong>
                  {selectedMember.role || "member"}
                </strong>
              </div>

              <div className="member-detail-row">
                <span>Member ID</span>
                <strong>{selectedMember.id}</strong>
              </div>

            </div>

            <div className="member-modal-actions">

              <button
                type="button"
                className="modal-edit-btn"
                onClick={() => openEditForm(selectedMember)}
              >
                <Pencil size={16} />
                Edit Member
              </button>

              <button
                type="button"
                className="modal-delete-btn"
                onClick={() => handleDelete(selectedMember)}
              >
                <Trash2 size={16} />
                Delete Member
              </button>

              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setSelectedMember(null)}
              >
                Close
              </button>

            </div>

          </div>
        </div>
      )}

    </div>
  );
}
