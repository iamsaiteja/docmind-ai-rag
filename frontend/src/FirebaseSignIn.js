import React, { useRef, useState } from "react";
import { initializeApp } from "firebase/app";
import {
  browserPopupRedirectResolver, GoogleAuthProvider, initializeAuth, inMemoryPersistence,
  RecaptchaVerifier, signInWithPhoneNumber, signInWithPopup, signOut,
} from "firebase/auth";

const phoneEnabled = process.env.REACT_APP_FIREBASE_PHONE_ENABLED === "true";
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
  "auth/invalid-phone-number": "Enter a mobile number with the country code, such as +91.",
  "auth/invalid-verification-code": "That code is incorrect. Check the SMS and try again.",
  "auth/code-expired": "That code expired. Request a new one.",
  "auth/session-expired": "That code expired. Request a new one.",
  "auth/too-many-requests": "Too many attempts. Please wait and try again later.",
  "auth/quota-exceeded": "The SMS limit has been reached. Try again later.",
  "auth/network-request-failed": "Could not reach the sign-in service. Check your connection.",
};

export default function FirebaseSignIn({ pending, setPending, clearError, exchange, apiError, fieldClass, actionClass }) {
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const [verified, setVerified] = useState(false);
  const [message, setMessage] = useState("");
  const active = useRef(false);
  const recaptcha = useRef(null);
  const phoneToken = useRef("");
  const button = `${actionClass} w-full border border-rose-300 bg-white text-ink enabled:hover:bg-rose-50`;

  function resetCode() {
    setConfirmation(null);
    setVerified(false);
    phoneToken.current = "";
  }

  async function run(kind, work) {
    if (active.current || pending) return;
    active.current = true;
    setPending(kind);
    clearError();
    setMessage("");
    try {
      await work();
    } catch (error) {
      if (["auth/code-expired", "auth/session-expired"].includes(error.code)) resetCode();
      setMessage(error.response ? apiError(error) : messages[error.code] || "Sign-in could not be completed. Please try again.");
    } finally {
      active.current = false;
      setPending("");
    }
  }

  async function getToken(user) {
    try {
      return await user.getIdToken();
    } finally {
      await signOut(authInstance());
    }
  }

  async function google() {
    const { user } = await signInWithPopup(authInstance(), new GoogleAuthProvider());
    await exchange(await getToken(user));
  }

  async function sendCode(number) {
    const normalized = number.replace(/[\s()-]/g, "");
    if (!/^\+[1-9][0-9]{6,14}$/.test(normalized)) {
      setMessage(messages["auth/invalid-phone-number"]);
      return;
    }
    const instance = authInstance();
    const verifier = new RecaptchaVerifier(instance, recaptcha.current, { size: "invisible" });
    try {
      setConfirmation(await signInWithPhoneNumber(instance, normalized, verifier));
    } finally {
      verifier.clear();
    }
  }

  async function verifyCode(code) {
    if (!phoneToken.current) {
      const { user } = await confirmation.confirm(code);
      phoneToken.current = await getToken(user);
      setVerified(true);
    }
    try {
      await exchange(phoneToken.current);
    } catch (error) {
      if (error.response?.status === 401) resetCode();
      throw error;
    }
    phoneToken.current = "";
  }

  return (
    <div className="mt-3 space-y-3 border-t border-rose-100 pt-3">
      <button type="button" className={button} disabled={Boolean(pending)} onClick={() => run("google", google)}>
        {pending === "google" ? "Opening Google sign-in…" : "Continue with Google"}
      </button>
      {phoneEnabled && <>
        <button type="button" className={button} aria-expanded={phoneOpen} disabled={Boolean(pending)} onClick={() => {
          setPhoneOpen(!phoneOpen);
          resetCode();
          setMessage("");
        }}>{phoneOpen ? "Close mobile sign-in" : "Continue with mobile number"}</button>
        {phoneOpen && <div className="rounded-xl bg-rose-50 p-3">
          {confirmation ? (
            <form className="space-y-3" onSubmit={(event) => {
              event.preventDefault();
              const code = new FormData(event.currentTarget).get("code");
              run("verify-code", () => verifyCode(code));
            }}>
              {verified ? <p className="text-sm" role="status">Mobile number verified.</p> : <>
                <p className="text-sm" role="status">We sent a code by SMS.</p>
                <label className="block text-sm font-medium">SMS code
                  <input name="code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}"
                    maxLength={6} className={fieldClass} required />
                </label>
              </>}
              <button type="submit" className={button} disabled={Boolean(pending)}>
                {pending === "verify-code" ? "Verifying…" : verified ? "Retry sign-in" : "Verify code"}
              </button>
              <button type="button" className="min-h-11 text-sm font-semibold text-brand" disabled={Boolean(pending)}
                onClick={() => { resetCode(); setMessage(""); }}>Request a new code</button>
            </form>
          ) : (
            <form className="space-y-3" onSubmit={(event) => {
              event.preventDefault();
              const number = new FormData(event.currentTarget).get("phone");
              run("send-code", () => sendCode(number));
            }}>
              <label className="block text-sm font-medium">Mobile number with country code
                <input name="phone" type="tel" autoComplete="tel" placeholder="+91" maxLength={24} className={fieldClass} required />
              </label>
              <p className="text-xs text-ink/75">By requesting a code, you agree to receive an SMS. Google processes the number for verification and abuse prevention.</p>
              <button type="submit" className={button} disabled={Boolean(pending)}>
                {pending === "send-code" ? "Sending code…" : "Send SMS code"}
              </button>
            </form>
          )}
          <div ref={recaptcha} />
        </div>}
      </>}
      {message && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800" role="alert">{message}</p>}
    </div>
  );
}
