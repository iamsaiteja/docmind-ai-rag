import axios from "axios";
import { API, API_TIMEOUT, authenticatedApi } from "./apiClient";

jest.mock("axios");

test("binds each workspace request client to its own session token", () => {
  authenticatedApi("first");
  authenticatedApi("second");
  expect(axios.create).toHaveBeenNthCalledWith(1, {
    baseURL: API,
    timeout: API_TIMEOUT,
    headers: { Authorization: "Bearer first" },
  });
  expect(axios.create).toHaveBeenNthCalledWith(2, {
    baseURL: API,
    timeout: API_TIMEOUT,
    headers: { Authorization: "Bearer second" },
  });
});
