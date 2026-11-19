import { fireEvent, render, screen } from "@testing-library/react";
import axios from "axios";
import AccountGate from "./AccountGate";
import { API, API_TIMEOUT } from "./apiClient";

jest.mock("axios");
jest.mock("./App", () => ({ workspace }) => <p>{workspace.profile.role} workspace</p>);

const get = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  sessionStorage.clear();
  global.fetch = jest.fn().mockResolvedValue({ ok: true });
  axios.create.mockReturnValue({ get });
});

test("opens the guest demo from the session response without a profile request", async () => {
  axios.post.mockResolvedValue({ data: { token: "guest-token", profile: { role: "guest" } } });
  render(<AccountGate />);

  fireEvent.click(screen.getByRole("button", { name: "Continue as guest" }));
  expect(screen.getByRole("button", { name: "Starting guest session…" })).toBeDisabled();
  expect(await screen.findByText("guest workspace")).toBeInTheDocument();
  expect(axios.post).toHaveBeenCalledWith(`${API}/sessions`, undefined, { timeout: API_TIMEOUT });
  expect(get).not.toHaveBeenCalled();
});

test("opens the signed-in workspace after loading account chats and documents in parallel", async () => {
  axios.post.mockResolvedValue({ data: { token: "account-token", profile: { role: "user", email: "test@example.com" } } });
  get.mockImplementation((path) => ({
    "/chats": Promise.resolve({ data: { chats: [], revision: 0 } }),
    "/documents": Promise.resolve({ data: { files: [] } }),
  })[path]);
  render(<AccountGate />);

  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "test@example.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "example-password" } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

  expect(await screen.findByText("user workspace")).toBeInTheDocument();
  expect(get.mock.calls.map(([path]) => path)).toEqual(["/chats", "/documents"]);
});

test("checks an existing session before opening its workspace after refresh", async () => {
  sessionStorage.setItem("docmind-account-token", "restored-token");
  get.mockResolvedValue({ data: { role: "guest" } });
  render(<AccountGate />);

  expect(await screen.findByText("guest workspace")).toBeInTheDocument();
  expect(get).toHaveBeenCalledWith("/auth/me", expect.objectContaining({ signal: expect.anything() }));
});
