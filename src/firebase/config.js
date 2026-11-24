import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Warn loudly in the console when the app is run/deployed without its
// Firebase environment variables, instead of failing mysteriously on the
// login screen. Copy .env.example to .env and fill in the values.
if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  console.error(
    "GymNexus: Firebase is not configured. " +
      "Set the VITE_FIREBASE_* variables (see .env.example) and restart."
  );
}

// Initialise defensively: with missing/invalid env values getAuth() throws
// at module load, which used to crash the whole app to a blank white page.
// Instead, export nulls plus a firebaseReady flag so the UI can show a
// clear "setup needed" screen.
let auth = null;
let db = null;
let firebaseReady = false;

try {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  firebaseReady = true;
} catch (error) {
  console.error("GymNexus: Firebase failed to initialise:", error);
}

export { auth, db, firebaseReady };