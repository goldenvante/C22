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
