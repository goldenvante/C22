import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";

import { supabase, type Profile } from "@/lib/supabase";

type AuthContextValue = {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  notice: string | null;
  /** True cuando user_metadata.debe_cambiar_password === true (temporal). */
  requiresPasswordChange: boolean;
  /**
   * Cierra sesión con limpieza local garantizada: intenta revocar en servidor
   * y, pase lo que pase (red, storage, sesión ya inválida), deja
   * session/profile en null para que RouteGate lleve a "/".
   * Devuelve el error de servidor si lo hubo, sin lanzar.
   */
  signOut: () => Promise<Error | null>;
  clearNotice: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id,usuario,nombre,rol,activo")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return data as Profile;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (alive) setSession(data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (alive) setSession(s);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let alive = true;
    async function load() {
      if (!session?.user) {
        if (alive) {
          setProfile(null);
          setLoading(false);
        }
        return;
      }
      const p = await fetchProfile(session.user.id).catch(() => null);
      if (!alive) return;
      if (!p) {
        setProfile(null);
        setNotice("Tu usuario no tiene perfil asignado. Contacta al administrador.");
      } else if (!p.activo) {
        setProfile(null);
        setNotice("Tu cuenta está desactivada. Contacta al administrador.");
        await supabase.auth.signOut();
      } else {
        setProfile(p);
      }
      setLoading(false);
    }
    load();
    return () => {
      alive = false;
    };
  }, [session]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      profile,
      loading,
      notice,
      // Se recalcula solo cuando cambia la sesión (login, refresh, USER_UPDATED
      // tras limpiar el flag con updateUser). No toca fetchProfile ni roles.
      requiresPasswordChange:
        session?.user?.user_metadata?.debe_cambiar_password === true,
      signOut: async () => {
        // Limpieza local PRIMERO y sincrónica: no depende de la red. Si el
        // revoke en servidor se cuelga (respuesta perdida), el await de abajo
        // nunca se resolvería y la app quedaría en la ruta anterior con una
        // sesión muerta. RouteGate navega a "/" al ver session === null.
        setProfile(null);
        setSession(null);
        try {
          // Revocación best-effort en segundo plano: no bloquea ni revierte
          // la limpieza local. Si llega SIGNED_OUT después, reasigna null.
          const { error } = await supabase.auth.signOut();
          if (error) return error;
        } catch (e) {
          return e instanceof Error ? e : new Error("No se pudo cerrar sesión.");
        }
        return null;
      },
      clearNotice: () => setNotice(null),
    }),
    [session, profile, loading, notice],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}
