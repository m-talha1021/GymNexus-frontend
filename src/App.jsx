
import { useEffect, useState } from "react";

import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

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

// Sidebar destinations that do not have a dedicated page yet.
// They render a simple notice instead of a blank content area.
const PLACEHOLDER_PAGES = {
  payments: "Payments",
  inquiries: "Inquiries",
  settings: "Settings",
};

function App() {
  const [user, setUser] = useState(null);
  const [ownerProfile, setOwnerProfile] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(firebaseReady);

  const [authPage, setAuthPage] = useState("login");
  const [splashDone, setSplashDone] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activePage, setActivePage] = useState("dashboard");

  useEffect(() => {
    if (!firebaseReady) return;

    let mounted = true;

    const unsubscribe = onAuthStateChanged(
      auth,
      async (currentUser) => {
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

        try {
          const adminRef = doc(db, "admins", currentUser.uid);
          const adminSnap = await getDoc(adminRef);

          if (!mounted) return;

          if (
            adminSnap.exists() &&
            adminSnap.data().role === "owner"
          ) {
            setIsAdmin(true);
            setOwnerProfile(adminSnap.data());
          }
        } catch (error) {
          console.error("Owner verification failed:", error);
        } finally {
          if (mounted) setCheckingAuth(false);
        }
      }
    );

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  // Keep the splash screen up for a short minimum time so the
  // branding is actually seen even when the auth check is instant.
  useEffect(() => {
    const timer = setTimeout(() => setSplashDone(true), 1600);
    return () => clearTimeout(timer);
  }, []);

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
        <h1 className="splash-name">
          Gym<span>Nexus</span>
        </h1>
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
