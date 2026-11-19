import React, { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { initializeAuth, signInWithPopup, signOut } from "firebase/auth";
import FirebaseSignIn from "./FirebaseSignIn";

jest.mock("firebase/app", () => ({ initializeApp: jest.fn() }));
jest.mock("firebase/auth", () => ({
  GoogleAuthProvider: jest.fn(),
  initializeAuth: jest.fn(),
  signInWithPopup: jest.fn(),
  signOut: jest.fn(),
}));

function SignIn({ exchange }) {
  const [pending, setPending] = useState("");
  return <FirebaseSignIn pending={pending} setPending={setPending} clearError={() => {}}
    exchange={exchange} apiError={() => "Could not sign in."} />;
}

beforeEach(() => {
  jest.clearAllMocks();
  initializeAuth.mockReturnValue({});
});

test("uses the Google Firebase ID token to open the DocMind session", async () => {
  signInWithPopup.mockResolvedValue({ user: { getIdToken: async () => "google-id-token" } });
  const exchange = jest.fn();
  render(<SignIn exchange={exchange} />);
  fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
  await waitFor(() => expect(exchange).toHaveBeenCalledWith("google-id-token"));
  expect(signOut).toHaveBeenCalledTimes(1);
});

test("keeps the account form usable when the Google popup is closed", async () => {
  signInWithPopup.mockRejectedValue({ code: "auth/popup-closed-by-user" });
  const exchange = jest.fn();
  render(<SignIn exchange={exchange} />);
  fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Google sign-in was closed.");
  expect(screen.getByRole("button", { name: "Continue with Google" })).toBeEnabled();
  expect(exchange).not.toHaveBeenCalled();
});
