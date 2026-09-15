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
  rol: ProfileRole;
  activo: boolean;
};

export function loginEmailForUsuario(usuario: string): string {
  return `${usuario.trim().toLowerCase()}@${AUTH_EMAIL_DOMAIN}`;
}
