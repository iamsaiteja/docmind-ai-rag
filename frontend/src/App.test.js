import axios from "axios";
import { API, authenticatedApi } from "./apiClient";

jest.mock("axios");

test("binds each workspace request client to its own session token", () => {
  authenticatedApi("first");
  authenticatedApi("second");
  expect(axios.create).toHaveBeenNthCalledWith(1, {
    baseURL: API,
    headers: { Authorization: "Bearer first" },
  });
  expect(axios.create).toHaveBeenNthCalledWith(2, {
    baseURL: API,
    headers: { Authorization: "Bearer second" },
  });
});
