import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { clearAjyalSession } from "@/lib/ajyalAuth";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null = checking, false = anon, object = user
  const [meta, setMeta] = useState(null);

  const loadMe = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
      return data;
    } catch (e) {
      setUser(false);
      return false;
    }
  }, []);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  useEffect(() => {
    if (user && user.id && !meta) {
      api.get("/rbac/meta").then(({ data }) => setMeta(data)).catch(() => {});
    }
  }, [user, meta]);

  const login = async (email, password, remember) => {
    const { data } = await api.post("/auth/login", { email, password, remember });
    if (data.requires_2fa) return { requires_2fa: true, user_id: data.user_id };
    setUser(data.user);
    return { user: data.user };
  };

  const verify2fa = async (user_id, otp) => {
    const { data } = await api.post("/auth/login/2fa", { user_id, otp });
    setUser(data.user);
    return data.user;
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch (e) {}
    clearAjyalSession();
    setUser(false);
  };

  const can = (perm) => {
    if (!user) return false;
    if (["SUPER_ADMIN", "DIRECTOR"].includes(user.role)) return true;
    return (user.permissions || []).includes(perm);
  };

  const hasRole = (...roles) => user && roles.includes(user.role);

  return (
    <AuthContext.Provider value={{ user, setUser, meta, login, verify2fa, logout, loadMe, can, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
