import { createClient } from "@supabase/supabase-js";
import "expo-sqlite/localStorage/install";
import "react-native-url-polyfill/auto";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabasePublishableKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    storage: localStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Dominio interno para login por username. El usuario final nunca lo ve:
// escribe solo su username y la app construye `${usuario}@c22.internal`.
export const AUTH_EMAIL_DOMAIN = "c22.internal";

export type ProfileRole = "admin" | "seller" | "access";

export type Profile = {
  id: string;
  usuario: string;
  nombre: string;
  /** 1-2 roles: ['admin'] o combinación de 'seller'/'access'. */
  roles: ProfileRole[];
  activo: boolean;
  committee_id: string | null;
};

/** ¿El profile tiene el rol? (admin, seller, access o ambos). */
export function hasRole(profile: Profile | null | undefined, rol: ProfileRole): boolean {
  return !!profile && Array.isArray(profile.roles) && profile.roles.includes(rol);
}

/** Etiqueta legible: "Vendedor", "Control de acceso" o "Vendedor + Control de acceso". */
export function rolesLabel(roles: ProfileRole[] | null | undefined, fallback = "Sin rol"): string {
  const labels: Record<Exclude<ProfileRole, "admin">, string> = {
    seller: "Vendedor",
    access: "Control de acceso",
  };
  const parts = (roles ?? []).map((r) =>
    r === "admin" ? "Administrador" : labels[r],
  );
  return parts.length > 0 ? parts.join(" + ") : fallback;
}

/** Comité/organización: tenant + branding (nombre, colores, logo en nube). */
export type Committee = {
  id: string;
  nombre: string;
  color_primario: string;
  color_secundario: string;
  color_fondo: string;
  logo_url: string | null;
};

export function loginEmailForUsuario(usuario: string): string {
  return `${usuario.trim().toLowerCase()}@${AUTH_EMAIL_DOMAIN}`;
}
