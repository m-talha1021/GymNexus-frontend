
import { useEffect, useState } from "react";

import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";

import { auth, db, firebaseReady } from "./firebase/config";
import logo from "./assets/logo.png";

import {
  Sidebar,
  Header,
  Dashboard,
} from "./components/DashboardComponents";

import Login from "./pages/Auth/Login.jsx";
import Signup from "./pages/Auth/Signup.jsx";
import Members from "./pages/Members/Members.jsx";
import Memberships from "./pages/Memberships/Memberships.jsx";
import Payments from "./pages/Payments/Payments.jsx";

// Sidebar destinations that do not have a dedicated page yet.
// They render a simple notice instead of a blank content area.
const PLACEHOLDER_PAGES = {
  inquiries: "Inquiries",
};

function App() {
  const [user, setUser] = useState(null);
  const [ownerProfile, setOwnerProfile] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(firebaseReady);

  const [activating, setActivating] = useState(false);
  const [activateError, setActivateError] = useState("");

  const [authPage, setAuthPage] = useState("login");
  const [splashDone, setSplashDone] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activePage, setActivePage] = useState("dashboard");

  useEffect(() => {
    if (!firebaseReady) return;

    let mounted = true;

    let adminUnsubscribe = null;

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (adminUnsubscribe) {
        adminUnsubscribe();
        adminUnsubscribe = null;
      }

      if (!mounted) return;

      setCheckingAuth(true);
      setUser(currentUser);
      setIsAdmin(false);
      setOwnerProfile(null);

      if (!currentUser) {
        setActivePage("dashboard");
        setCheckingAuth(false);
        return;
      }

      // Live listener (not a one-time read): the owner record is
      // created during signup just after sign-in, so a one-time
      // read can run before the record exists and wrongly deny
      // access. Listening re-opens the gate the moment it appears.
      const adminRef = doc(db, "admins", currentUser.uid);
      adminUnsubscribe = onSnapshot(
        adminRef,
        (adminSnap) => {
          if (!mounted) return;

          if (
            adminSnap.exists() &&
            adminSnap.data().role === "owner"
          ) {
            setIsAdmin(true);
            setOwnerProfile(adminSnap.data());
          } else {
            setIsAdmin(false);
            setOwnerProfile(null);
          }
          setCheckingAuth(false);
        },
        (error) => {
          console.error("Owner verification failed:", error);
          if (mounted) setCheckingAuth(false);
        }
      );
    });

    return () => {
      mounted = false;
      if (adminUnsubscribe) adminUnsubscribe();
      unsubscribe();
    };
  }, []);

  // Keep the splash screen up for a short minimum time so the
  // branding is actually seen even when the auth check is instant.
  useEffect(() => {
    const timer = setTimeout(() => setSplashDone(true), 1600);
    return () => clearTimeout(timer);
  }, []);

  // One-tap fix for accounts created before signup made the owner
  // record automatically: create it now from the signed-in profile.
  // The live owner listener above opens the gate as soon as it lands.
  const handleActivateOwner = async () => {
    if (!user) return;
    setActivating(true);
    setActivateError("");

    try {
      await setDoc(doc(db, "admins", user.uid), {
        fullName: user.displayName || "",
        email: user.email || "",
        role: "owner",
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      console.error("Owner activation failed:", error);
      setActivateError(
        "Could not activate this account. Please try again."
      );
    } finally {
      setActivating(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setSidebarOpen(false);
      setActivePage("dashboard");
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const handleNavigation = (page) => {
    setActivePage(page);
    setSidebarOpen(false);
  };

  if (!firebaseReady) {
    return (
      <div className="loading-screen">
        <h2>Setup needed</h2>
        <p>
          GymNexus is deployed, but its Firebase settings are
          missing. Add the VITE_FIREBASE_* environment variables
          (see .env.example) and redeploy.
        </p>
      </div>
    );
  }

  if (checkingAuth || !splashDone) {
    return (
      <div className="splash-screen">
        <img className="splash-logo" src={logo} alt="GymNexus Logo" />
        <div className="splash-bar">
          <div className="splash-bar-fill" />
        </div>
      </div>
    );
  }

  if (!user) {
    return authPage === "signup" ? (
      <Signup
        onSignupSuccess={() => setAuthPage("login")}
        onLogin={() => setAuthPage("login")}
      />
    ) : (
      <Login onSignup={() => setAuthPage("signup")} />
    );
  }

  if (!isAdmin) {
    return (
      <div className="loading-screen">
        <h2>Access Denied</h2>
        <p>
          This account is not authorized to access GymNexus.
        </p>
        <p>
          If this is a gym owner account, activate it to continue.
        </p>
        <button
          className="activate-button"
          onClick={handleActivateOwner}
          disabled={activating}
        >
          {activating ? "Activating..." : "Activate owner access"}
        </button>
        {activateError && (
          <p className="activate-error">{activateError}</p>
        )}
        <button onClick={handleLogout}>Logout</button>
      </div>
    );
  }

  return (
    <div className="app-layout">

      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          className="sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar
        isOpen={sidebarOpen}
        onLogout={handleLogout}
        activePage={activePage}
        onNavigate={handleNavigation}
      />

      <main className="main-area">

        <Header
          onMenuClick={() =>
            setSidebarOpen((open) => !open)
          }
          user={user}
          ownerProfile={ownerProfile}
          activePage={activePage}
        />

        <div className="page-content">

          {activePage === "dashboard" && (
            <Dashboard
              user={user}
              onNavigate={handleNavigation}
            />
          )}

          {activePage === "members" && (
            <Members />
          )}

          {activePage === "packages" && (
            <Memberships />
          )}

          {activePage === "payments" && (
            <Payments />
          )}

          {PLACEHOLDER_PAGES[activePage] && (
            <div className="dashboard-content">
              <div className="dashboard-panel placeholder-panel">
                <h3>{PLACEHOLDER_PAGES[activePage]}</h3>
                <p>
                  This section has not been built yet. It will
                  appear here in a future update.
                </p>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}

export default App;
