import React, { useRef, useState } from "react";
import { initializeApp } from "firebase/app";
import {
  browserPopupRedirectResolver, GoogleAuthProvider, initializeAuth,
  inMemoryPersistence, signInWithPopup, signOut,
} from "firebase/auth";

let auth;

function authInstance() {
  if (!auth) {
    const app = initializeApp({
      apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
      authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
      appId: process.env.REACT_APP_FIREBASE_APP_ID,
    });
    auth = initializeAuth(app, {
      persistence: inMemoryPersistence,
      popupRedirectResolver: browserPopupRedirectResolver,
    });
  }
  return auth;
}

const messages = {
  "auth/popup-closed-by-user": "Google sign-in was closed. Try again when you’re ready.",
  "auth/popup-blocked": "Allow pop-ups for DocMind, then try Google sign-in again.",
  "auth/network-request-failed": "Could not reach the sign-in service. Check your connection.",
};

export default function FirebaseSignIn({ pending, setPending, clearError, exchange, apiError, actionClass }) {
  const [message, setMessage] = useState("");
  const active = useRef(false);

  async function signIn() {
    if (active.current || pending) return;
    active.current = true;
    setPending("google");
    clearError();
    setMessage("");
    try {
      const instance = authInstance();
      const { user } = await signInWithPopup(instance, new GoogleAuthProvider());
      let token;
      try {
        token = await user.getIdToken();
      } finally {
        await signOut(instance);
      }
      await exchange(token);
    } catch (error) {
      setMessage(error.response ? apiError(error) : messages[error.code] || "Google sign-in could not be completed. Please try again.");
    } finally {
      active.current = false;
      setPending("");
    }
  }

  return (
    <div className="mt-3 space-y-3 border-t border-rose-100 pt-3">
      <button type="button" className={`${actionClass} w-full border border-rose-300 bg-white text-ink enabled:hover:bg-rose-50`}
        disabled={Boolean(pending)} onClick={signIn}>
        {pending === "google" ? "Opening Google sign-in…" : "Continue with Google"}
      </button>
      {message && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800" role="alert">{message}</p>}
    </div>
  );
}
