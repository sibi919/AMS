import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { supabase } from "./client";
import { AuthContext } from "./context";
import type { Profile } from "./types";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [error, setError] = useState("");
  const revision = useRef(0);
  const refresh = useCallback(async () => {
    const client = supabase;
    if (!client) return;
    const version = ++revision.current;
    try {
      const {
        data: { session },
        error: sessionError,
      } = await client.auth.getSession();
      if (sessionError) throw sessionError;
      let next: Profile | null = null;
      if (session) {
        const { data, error: profileError } = await client
          .from("profiles")
          .select("*")
          .eq("id", session.user.id)
          .single();
        if (
          profileError ||
          !data?.active ||
          !["student", "staff", "admin"].includes(data.role)
        )
          throw new Error("Account unavailable");
        next = data as Profile;
      }
      if (version === revision.current) {
        setProfile(next);
        setError("");
      }
    } catch {
      if (version === revision.current) {
        setProfile(null);
        setError(
          "Your account could not be loaded. Retry, or contact the academy if access has been disabled.",
        );
      }
    } finally {
      if (version === revision.current) setLoading(false);
    }
  }, []);
  const signOut = useCallback(async () => {
    ++revision.current;
    setProfile(null);
    setLoading(false);
    setError("");
    if (supabase) {
      const { error: logoutError } = await supabase.auth.signOut({
        scope: "local",
      });
      if (logoutError)
        setError(
          "Sign-out could not be completed. Please retry before leaving this device.",
        );
    }
  }, []);
  useEffect(() => {
    // This effect synchronizes the initial session with the external Auth service.
    // eslint-disable-next-line react/set-state-in-effect
    void refresh();
    // Defer Auth calls outside the auth event callback to avoid the SDK's session lock.
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const { data } = supabase?.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        ++revision.current;
        setProfile(null);
        setError("");
        setLoading(false);
        return;
      }
      const timer = setTimeout(() => {
        timers.delete(timer);
        void refresh();
      }, 0);
      timers.add(timer);
    }) ?? { data: null };
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    const interval = window.setInterval(onVisible, 60000);
    const generation = revision;
    return () => {
      ++generation.current;
      data?.subscription.unsubscribe();
      timers.forEach(clearTimeout);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);
  return (
    <AuthContext.Provider value={{ profile, loading, error, refresh, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
