import { useEffect, useState } from "react";

import { useAuth } from "@/auth/AuthProvider";
import { supabase, type Committee } from "@/lib/supabase";

/** Paleta por defecto: neutra elegante. El color llega con el comité del admin. */
export const DEFAULT_BRAND = {
  primary: "#111111",
  secondary: "#6B7280",
  background: "#FFFFFF",
} as const;

export const COLOR_PRESETS = [
  "#111111",
  "#6B7280",
  "#FFFFFF",
  "#8B263D",
  "#1D4ED8",
  "#047857",
  "#7C3AED",
  "#B45309",
] as const;

export const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

export function normalizeHex(raw: string): string | null {
  const v = raw.trim();
  if (HEX_RE.test(v)) return v.toUpperCase();
  const short = /^#([0-9A-Fa-f]{3})$/.exec(v);
  if (short) {
    const [r, g, b] = short[1].split("");
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return null;
}

/**
 * Comité del usuario autenticado (tenant + branding en nube).
 * Sin sesión/profile -> committee null y colores por defecto.
 */
export function useCommittee(): {
  committee: Committee | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
} {
  const { profile, session } = useAuth();
  const [committee, setCommittee] = useState<Committee | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    async function load() {
      if (!session || !profile?.committee_id) {
        if (alive) {
          setCommittee(null);
          setLoading(false);
        }
        return;
      }
      setLoading(true);
      setError(null);
      const { data, error: qError } = await supabase
        .from("committees")
        .select("id,nombre,color_primario,color_secundario,color_fondo,logo_url")
        .eq("id", profile.committee_id)
        .maybeSingle();
      if (!alive) return;
      if (qError) {
        setError("No se pudo cargar tu comité.");
        setCommittee(null);
      } else {
        setCommittee((data as Committee | null) ?? null);
      }
      setLoading(false);
    }
    load();
    return () => {
      alive = false;
    };
    // nonce permite refresh manual; profile/committee_id como deps reales.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, profile?.committee_id, nonce]);

  return {
    committee,
    loading,
    error,
    refresh: () => setNonce((n) => n + 1),
  };
}

/** Colores efectivos: comité o defaults. Misma forma que la paleta anterior. */
export function useBrandColors(): { primary: string; secondary: string; background: string } {
  const { committee } = useCommittee();
  if (!committee) return { ...DEFAULT_BRAND };
  return {
    primary: HEX_RE.test(committee.color_primario) ? committee.color_primario : DEFAULT_BRAND.primary,
    secondary: HEX_RE.test(committee.color_secundario)
      ? committee.color_secundario
      : DEFAULT_BRAND.secondary,
    background: HEX_RE.test(committee.color_fondo) ? committee.color_fondo : DEFAULT_BRAND.background,
  };
}
