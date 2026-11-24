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

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);