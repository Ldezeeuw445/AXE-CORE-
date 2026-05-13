import React, { createContext, useContext, useEffect, useState } from "react";
import { auth as authApi } from "../lib/api";

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem("axe_token"));
  const [email, setEmail] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (token) {
        try {
          const me = await authApi.me();
          if (mounted) setEmail(me.email);
        } catch {
          localStorage.removeItem("axe_token");
          if (mounted) setToken(null);
        }
      }
      if (mounted) setReady(true);
    })();
    return () => { mounted = false; };
  }, [token]);

  const login = async (em, pw) => {
    const data = await authApi.login(em, pw);
    localStorage.setItem("axe_token", data.access_token);
    setToken(data.access_token);
    setEmail(data.email);
    return data;
  };

  const logout = () => {
    localStorage.removeItem("axe_token");
    setToken(null); setEmail(null);
  };

  return (
    <Ctx.Provider value={{ token, email, ready, login, logout }}>
      {children}
    </Ctx.Provider>
  );
}
