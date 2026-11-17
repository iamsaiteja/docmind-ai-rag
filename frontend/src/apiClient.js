import axios from "axios";

export const API = process.env.REACT_APP_API_URL || (process.env.NODE_ENV === "production"
  ? "https://docmind-12ms.onrender.com"
  : "http://localhost:8000");
export const API_TIMEOUT = 75_000;

export function authenticatedApi(token) {
  return axios.create({
    baseURL: API,
    timeout: API_TIMEOUT,
    headers: { Authorization: `Bearer ${token}` },
  });
}
