/**
 * Paleta de interfaz: base elegante en neutros (negro/blanco/gris) + acentos
 * del comité. Los colores del admin (primary/secondary/background) son
 * intocables por el usuario: solo cambian botones principales, títulos,
 * reglas y selecciones. El usuario solo elige claro/oscuro/automático.
 */

export type BrandInput = {
  primary: string;
  secondary: string;
  background: string;
};

export type Scheme = "light" | "dark";

export type UIPalette = {
  /** Acento del comité (botones principales, títulos, seleccionados). */
  primary: string;
  /** Texto sobre primary (contraste legible). */
  onPrimary: string;
  /** Acento secundario del comité (reglas, detalles). */
  accent: string;
  /** Fondo de pantalla. */
  background: string;
  /** Fondo de tarjetas/inputs/modales. */
  surface: string;
  /** Fondo tenue para botones secundarios. */
  secondaryBg: string;
  /** Bordes. */
  border: string;
  /** Texto principal y títulos (oscuro: texto claro). */
  title: string;
  text: string;
  textSoft: string;
  success: string;
  danger: string;
  rule: string;
  scrim: string;
  dark: boolean;
};

/** Base neutra elegante: se usa sin comité (antes del registro). */
export const NEUTRAL_BRAND: BrandInput = {
  primary: "#111111",
  secondary: "#6B7280",
  background: "#FFFFFF",
};

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

function clampChannel(v: string, fallback: string): string {
  return HEX_RE.test(v) ? v.toUpperCase() : fallback;
}

export function sanitizeBrand(raw: Partial<BrandInput> | null | undefined): BrandInput {
  return {
    primary: clampChannel(raw?.primary ?? "", NEUTRAL_BRAND.primary),
    secondary: clampChannel(raw?.secondary ?? "", NEUTRAL_BRAND.secondary),
    background: clampChannel(raw?.background ?? "", NEUTRAL_BRAND.background),
  };
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase();
}

/** Mezcla dos colores: t=0 → a, t=1 → b. */
export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

/** Blanco o negro según luminancia, para texto sobre el color del admin. */
export function readableOn(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#111111" : "#FFFFFF";
}

export function buildPalette(brandInput: BrandInput, scheme: Scheme): UIPalette {
  const brand = sanitizeBrand(brandInput);
  const dark = scheme === "dark";
  if (dark) {
    const background = "#0E0E10";
    const surface = "#17171A";
    return {
      primary: brand.primary,
      onPrimary: readableOn(brand.primary),
      accent: brand.secondary,
      background,
      surface,
      secondaryBg: mix(brand.secondary, surface, 0.72),
      border: "#2E2E33",
      title: "#F4F4F5",
      text: "#F4F4F5",
      textSoft: "#A7A7AE",
      success: "#7BA88B",
      danger: "#D08A94",
      rule: brand.secondary,
      scrim: "rgba(0,0,0,0.6)",
      dark: true,
    };
  }
  return {
    primary: brand.primary,
    onPrimary: readableOn(brand.primary),
    accent: brand.secondary,
    background: brand.background,
    surface: "#FFFFFF",
    secondaryBg: mix(brand.secondary, brand.background, 0.86),
    border: mix(brand.primary, brand.background, 0.25),
    title: brand.primary,
    text: "#141414",
    textSoft: "#6E6E73",
    success: "#58745D",
    danger: "#A94452",
    rule: brand.secondary,
    scrim: "rgba(0,0,0,0.5)",
    dark: false,
  };
}

/** Paleta clara neutra para renders estáticos (sin comité/sin sesión). */
export const NEUTRAL_LIGHT = buildPalette(NEUTRAL_BRAND, "light");
