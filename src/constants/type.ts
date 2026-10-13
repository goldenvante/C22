/**
 * Familias tipográficas reales de MONARQ, cargadas con `useFonts` en el root
 * layout desde `@expo-google-fonts/{manrope,inter}`.
 *
 * Módulo SIN dependencias (ni react-native ni global.css) a propósito: los
 * módulos puros que también verificamos con node fuera de la app —y los que
 * importan `features/sales/types`— pueden usar estas familias sin arrastrar el
 * árbol de bundler.
 *
 * Convención de la casa: el peso va EN el nombre del archivo, así que estas
 * familias se usan SIN `fontWeight` (poner ambos hace que Android busque una
 * variante que no existe y quede en el peso equivocado).
 */
export const Type = {
  /** Wordmark y encabezados: Manrope ExtraBold (800), uppercase. */
  display: "Manrope_800ExtraBold",
  /** Títulos de bloque: Manrope SemiBold (600). */
  heading: "Manrope_600SemiBold",
  /** Texto general: Inter Regular (400). */
  body: "Inter_400Regular",
  /** Texto general con énfasis: Inter Medium (500). */
  bodyMedium: "Inter_500Medium",
  /** Nombres de tarjeta y labels: Inter SemiBold (600). */
  bodySemibold: "Inter_600SemiBold",
  /** Saludo y énfasis fuerte: Inter Bold (700). */
  bodyBold: "Inter_700Bold",
} as const;

export type TicketFontCategory = "general" | "navidad" | "sanvalentin" | "terror" | "festiva";

export type TicketFont = {
  /** Valor persistido en `committees.titulo_fuente` y usado como `fontFamily`. */
  key: string;
  /** Nombre que ve el comité en Ajustes. */
  label: string;
  categoria: TicketFontCategory;
  /** Escala óptica: los scripts se ven menores y los display mayores a igual pt. */
  optical: number;
};

/** `key` de la familia por defecto: hereda la tipografía del sistema. */
export const TICKET_FONT_SYSTEM = "system";

export const TICKET_FONT_CATEGORIES: readonly {
  key: TicketFontCategory;
  label: string;
}[] = [
  { key: "general", label: "Generales" },
  { key: "navidad", label: "Navidad" },
  { key: "sanvalentin", label: "San Valentín" },
  { key: "terror", label: "Terror" },
  { key: "festiva", label: "Festivas" },
];

/**
 * Catálogo del título del boleto (29 familias + sistema). Las `key` deben
 * coincidir con los `useFonts` de `app/_layout.tsx` y con el archivo
 * `@expo-google-fonts/{paquete}/{peso}/{key}.ttf`.
 */
export const TICKET_FONTS: readonly TicketFont[] = [
  { key: TICKET_FONT_SYSTEM, label: "Sistema (por defecto)", categoria: "general", optical: 1 },
  { key: "Poppins_700Bold", label: "Poppins", categoria: "general", optical: 1 },
  { key: "Montserrat_700Bold", label: "Montserrat", categoria: "general", optical: 1 },
  { key: "PlayfairDisplay_700Bold", label: "Playfair Display", categoria: "general", optical: 1 },
  { key: "KalniaGlaze_700Bold", label: "Kalnia Glaze", categoria: "general", optical: 1 },
  { key: "Oswald_600SemiBold", label: "Oswald", categoria: "general", optical: 1 },
  { key: "BebasNeue_400Regular", label: "Bebas Neue", categoria: "general", optical: 0.85 },
  { key: "MountainsofChristmas_700Bold", label: "Mountains of Christmas", categoria: "navidad", optical: 0.9 },
  { key: "HennyPenny_400Regular", label: "Henny Penny", categoria: "navidad", optical: 0.9 },
  { key: "Merienda_700Bold", label: "Merienda", categoria: "navidad", optical: 1.15 },
  { key: "Caveat_700Bold", label: "Caveat", categoria: "navidad", optical: 1.15 },
  { key: "Lobster_400Regular", label: "Lobster", categoria: "navidad", optical: 1.1 },
  { key: "Pacifico_400Regular", label: "Pacifico", categoria: "navidad", optical: 1.1 },
  { key: "GreatVibes_400Regular", label: "Great Vibes", categoria: "sanvalentin", optical: 1.15 },
  { key: "PinyonScript_400Regular", label: "Pinyon Script", categoria: "sanvalentin", optical: 1.15 },
  { key: "Tangerine_700Bold", label: "Tangerine", categoria: "sanvalentin", optical: 1.15 },
  { key: "Allura_400Regular", label: "Allura", categoria: "sanvalentin", optical: 1.15 },
  { key: "Parisienne_400Regular", label: "Parisienne", categoria: "sanvalentin", optical: 1.15 },
  { key: "Italianno_400Regular", label: "Italianno", categoria: "sanvalentin", optical: 1.15 },
  { key: "AlexBrush_400Regular", label: "Alex Brush", categoria: "sanvalentin", optical: 1.15 },
  { key: "Sacramento_400Regular", label: "Sacramento", categoria: "sanvalentin", optical: 1.15 },
  { key: "DancingScript_700Bold", label: "Dancing Script", categoria: "sanvalentin", optical: 1.15 },
  { key: "Satisfy_400Regular", label: "Satisfy", categoria: "sanvalentin", optical: 1.15 },
  { key: "Nosifer_400Regular", label: "Nosifer", categoria: "terror", optical: 0.85 },
  { key: "RubikWetPaint_400Regular", label: "Rubik Wet Paint", categoria: "terror", optical: 0.85 },
  { key: "NewRocker_400Regular", label: "New Rocker", categoria: "terror", optical: 0.9 },
  { key: "FontdinerSwanky_400Regular", label: "Fontdiner Swanky", categoria: "festiva", optical: 0.9 },
  { key: "EmilysCandy_400Regular", label: "Emilys Candy", categoria: "festiva", optical: 0.85 },
  { key: "BerkshireSwash_400Regular", label: "Berkshire Swash", categoria: "festiva", optical: 0.9 },
  { key: "Lacquer_400Regular", label: "Lacquer", categoria: "festiva", optical: 0.85 },
];

/** Familia válida para `committees.titulo_fuente` (o la del sistema). */
export function isTicketFont(key: string): boolean {
  return TICKET_FONTS.some((f) => f.key === key);
}

export function ticketFont(key: string | null | undefined): TicketFont {
  return TICKET_FONTS.find((f) => f.key === key) ?? TICKET_FONTS[0];
}

/** Tamaño permitido por la migración: 20-48 pt. */
export function clampTicketTitleSize(size: number | null | undefined): number {
  const n = Math.round(Number(size));
  if (!Number.isFinite(n)) return 36;
  return Math.min(48, Math.max(20, n));
}
