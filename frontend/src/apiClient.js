import axios from "axios";

export const API = process.env.REACT_APP_API_URL || (process.env.NODE_ENV === "production"
  ? "https://docmind-12ms.onrender.com"
  : "http://localhost:8000");

export function authenticatedApi(token) {
  return axios.create({
    baseURL: API,
    headers: { Authorization: `Bearer ${token}` },
  });
}
