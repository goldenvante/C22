/**
 * Paleta de interfaz.
 *
 * MONARQ (producto) es la identidad base/fallback: sus tokens oficiales viven
 * en `MONARQ`, la fuente única. El brand del comité (primary/secondary/
 * background) es una identidad SECUNDARIA configurable e independiente: solo
 * pinta acentos, reglas y títulos del cliente.
 *
 * El usuario solo elige claro/oscuro/automático.
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

/**
 * MONARQ — identidad cromática oficial del producto (FUENTE ÚNICA).
 * Dirección: sofisticada, oscura, tecnológica, limpia, sobria, premium.
 */
export const MONARQ = {
  /** Fondo de pantalla (carbón oscuro). */
  background: "#141311",
  /** Fondo de tarjetas/inputs/modales. */
  surface: "#1F1E1B",
  /** Bordes (marfil muy tenue). Solo color: nunca se pasa a un parser hex. */
  border: "rgba(247,246,242,0.08)",
  /** Borde con doble de intensidad (pills, controles destacados). */
  borderStrong: "rgba(247,246,242,0.16)",
  /** Texto principal y títulos (marfil). */
  textPrimary: "#F7F6F2",
  /** Texto secundario y detalles (gris). */
  textSecondary: "#8C8A85",
  /** Acento del producto (taupe): reglas, puntos de tab, iconos de acento). */
  accent: "#A08F7A",
  /** Tinta sobre el acento (luminancia del taupe > 0.5 → tinta oscura). */
  onAccent: "#141311",
  /** Blanco puro. */
  white: "#FFFFFF",
  /** Punto verde: estado activo (para pantallas de estado). */
  statusActive: "#5BAA7A",
  /** Punto rojo: estado finalizado (para pantallas de estado). */
  statusEnded: "#C1594F",
} as const;

export type MonarqIdentity = typeof MONARQ;

/**
 * Marca por defecto del producto (fallback sin comité) en la forma que
 * entiende `buildPalette`. Deriva de MONARQ: no duplica valores.
 * El brand del comité sigue viniendo de `Committee.color_*`.
 */
export const NEUTRAL_BRAND: BrandInput = {
  primary: MONARQ.accent,
  secondary: MONARQ.textSecondary,
  background: MONARQ.background,
};

/** Formato de color aceptado en toda la app (#RRGGBB). Fuente única. */
export const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

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

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/**
 * Tinta sobre `hex`: tinta MONARQ o blanco puro según luminancia.
 * Umbral 0.5: el punto de cruce WCAG texto-claro/texto-oscuro está en
 * luminancia perceptual ~0.47-0.5. Con 0.6 se leía blanco puro sobre
 * matices medios (p. ej. `success`/`danger` en oscuro: 2.7:1 y 1.6:1).
 */
export function readableOn(hex: string): string {
  return luminance(hex) > 0.5 ? MONARQ.onAccent : MONARQ.white;
}

export function buildPalette(brandInput: BrandInput, scheme: Scheme): UIPalette {
  const brand = sanitizeBrand(brandInput);
  const dark = scheme === "dark";
  if (dark) {
    const background = MONARQ.background;
    const surface = MONARQ.surface;
    return {
      primary: brand.primary,
      onPrimary: readableOn(brand.primary),
      accent: brand.secondary,
      background,
      surface,
      secondaryBg: mix(brand.secondary, surface, 0.72),
      border: MONARQ.border,
      title: MONARQ.textPrimary,
      text: MONARQ.textPrimary,
      textSoft: MONARQ.textSecondary,
      success: "#7BA88B",
      danger: "#D08A94",
      rule: brand.secondary,
      scrim: "rgba(0,0,0,0.6)",
      dark: true,
    };
  }
  const background = brand.background;
  /**
   * Fondo claro → tinta oscura (mismo resultado histórico). Fondo oscuro →
   * tinta clara y superficies MONARQ: antes salían texto oscuro sobre fondo
   * oscuro (ilegible).
   */
  const lightBackground = luminance(background) > 0.6;
  return {
    primary: brand.primary,
    onPrimary: readableOn(brand.primary),
    accent: brand.secondary,
    background,
    surface: lightBackground ? MONARQ.white : MONARQ.surface,
    secondaryBg: mix(brand.secondary, background, 0.86),
    border: mix(brand.primary, background, 0.25),
    title: lightBackground ? brand.primary : MONARQ.textPrimary,
    text: lightBackground ? "#141414" : MONARQ.textPrimary,
    textSoft: lightBackground ? "#6E6E73" : MONARQ.textSecondary,
    success: "#58745D",
    danger: "#A94452",
    rule: brand.secondary,
    scrim: "rgba(0,0,0,0.5)",
    dark: false,
  };
}

/**
 * Paleta del fallback MONARQ en esquema claro (renders estáticos sin comité
 * o sin sesión). Conserva el nombre público por compatibilidad.
 */
export const NEUTRAL_LIGHT = buildPalette(NEUTRAL_BRAND, "light");
