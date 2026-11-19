import React, { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { initializeAuth, RecaptchaVerifier, signInWithPhoneNumber, signInWithPopup, signOut } from "firebase/auth";
import FirebaseSignIn from "./FirebaseSignIn";

jest.mock("firebase/app", () => ({ initializeApp: jest.fn() }));
jest.mock("firebase/auth", () => ({
  GoogleAuthProvider: jest.fn(),
  RecaptchaVerifier: jest.fn(),
  initializeAuth: jest.fn(),
  signInWithPhoneNumber: jest.fn(),
  signInWithPopup: jest.fn(),
  signOut: jest.fn(),
}));

jest.mock("./FirebaseSignIn", () => {
  process.env.REACT_APP_FIREBASE_PHONE_ENABLED = "true";
  return jest.requireActual("./FirebaseSignIn");
});

function SignIn({ exchange }) {
  const [pending, setPending] = useState("");
  return <FirebaseSignIn pending={pending} setPending={setPending} clearError={() => {}}
    exchange={exchange} apiError={() => "Could not sign in."} />;
}

beforeEach(() => {
  jest.clearAllMocks();
  initializeAuth.mockReturnValue({});
  RecaptchaVerifier.mockImplementation(() => ({ clear: jest.fn() }));
});

test("uses the Google Firebase ID token to open the DocMind session", async () => {
  signInWithPopup.mockResolvedValue({ user: { getIdToken: async () => "google-id-token" } });
  const exchange = jest.fn();
  render(<SignIn exchange={exchange} />);
  fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
  await waitFor(() => expect(exchange).toHaveBeenCalledWith("google-id-token"));
  expect(signOut).toHaveBeenCalledTimes(1);
});

test("sends an SMS through Firebase and exchanges the ID token only after code verification", async () => {
  const confirm = jest.fn().mockResolvedValue({ user: { getIdToken: async () => "phone-id-token" } });
  signInWithPhoneNumber.mockResolvedValue({ confirm });
  const exchange = jest.fn();
  render(<SignIn exchange={exchange} />);
  fireEvent.click(screen.getByRole("button", { name: "Continue with mobile number" }));
  fireEvent.change(screen.getByLabelText("Mobile number with country code"), { target: { value: "+91 90000 00001" } });
  fireEvent.click(screen.getByRole("button", { name: "Send SMS code" }));
  const code = await screen.findByLabelText("SMS code");
  expect(exchange).not.toHaveBeenCalled();
  expect(signInWithPhoneNumber).toHaveBeenCalledWith(expect.anything(), "+919000000001", expect.anything());
  fireEvent.change(code, { target: { value: "010234" } });
  fireEvent.click(screen.getByRole("button", { name: "Verify code" }));
  await waitFor(() => expect(exchange).toHaveBeenCalledWith("phone-id-token"));
  expect(confirm).toHaveBeenCalledWith("010234");
});
