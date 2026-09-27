import axios from "axios";

const BASE = process.env.REACT_APP_BACKEND_URL;

export const api = axios.create({
  baseURL: `${BASE}/api`,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

let refreshing = null;

api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const original = error.config;
    const status = error.response?.status;
    const url = original?.url || "";
    if (
      status === 401 &&
      !original._retry &&
      !url.includes("/auth/login") &&
      !url.includes("/auth/refresh") &&
      !url.includes("/auth/me")
    ) {
      original._retry = true;
      try {
        refreshing = refreshing || api.post("/auth/refresh");
        await refreshing;
        refreshing = null;
        return api(original);
      } catch (e) {
        refreshing = null;
        return Promise.reject(error);
      }
    }
    return Promise.reject(error);
  }
);

export function apiError(detail, fallback = "حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.") {
  const d = detail?.response?.data?.detail ?? detail;
  if (d == null) return fallback;
  if (typeof d === "string") return d;
  if (Array.isArray(d))
    return d.map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e))).filter(Boolean).join(" ");
  if (d && typeof d.msg === "string") return d.msg;
  return fallback;
}
