import { useCallback, useMemo } from "react";
import { StyleSheet, type TextStyle, type ViewStyle } from "react-native";

import { Spacing, Type } from "@/constants/theme";
import { useCommittee } from "@/branding/useCommittee";
import { useThemeChoice } from "@/branding/ThemeChoice";
import {
  NEUTRAL_BRAND,
  NEUTRAL_LIGHT,
  buildPalette,
  readableOn,
  type BrandInput,
  type UIPalette,
} from "@/branding/palette";
import type { EventEstado } from "./types";

/**
 * Estilos de la interfaz. Mismo layout de siempre; los colores salen de la
 * paleta: base neutra elegante (negro/blanco/gris) + acentos del comité.
 * El boleto digital (BoletoCard) NO usa esto: su diseño queda intacto.
 */
export function makeEventStyles(p: UIPalette) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: p.background,
    },
    scroll: {
      padding: Spacing.three,
      gap: Spacing.three,
      paddingBottom: Spacing.six,
    },
    center: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: p.background,
    },
    card: {
      backgroundColor: p.surface,
      borderColor: p.border,
      borderWidth: 1,
      borderRadius: Spacing.two,
      padding: Spacing.three,
      gap: Spacing.one,
    },
    screenTitle: {
      fontSize: 28,
      fontFamily: Type.heading,
      color: p.title,
    } as TextStyle,
    /** Cifra protagonista (folio HALL26-001). Una sola medida, sin overrides. */
    folio: {
      fontSize: 40,
      fontFamily: Type.heading,
      color: p.title,
    } as TextStyle,
    sectionTitle: {
      fontSize: 20,
      fontFamily: Type.heading,
      color: p.title,
    } as TextStyle,
    goldRule: {
      height: 3,
      width: 64,
      borderRadius: 2,
      backgroundColor: p.rule,
    } as ViewStyle,
    body: {
      fontSize: 16,
      lineHeight: 24,
      fontFamily: Type.body,
      color: p.text,
    } as TextStyle,
    small: {
      fontSize: 14,
      lineHeight: 20,
      fontFamily: Type.body,
      color: p.text,
    } as TextStyle,
    smallBold: {
      fontSize: 14,
      lineHeight: 20,
      fontFamily: Type.bodyBold,
      color: p.text,
    } as TextStyle,
    label: {
      fontSize: 14,
      fontFamily: Type.bodyBold,
      color: p.text,
      marginTop: Spacing.one,
    } as TextStyle,
    meta: {
      fontSize: 14,
      lineHeight: 20,
      fontFamily: Type.body,
      color: p.textSoft,
    } as TextStyle,
    error: {
      fontSize: 14,
      lineHeight: 20,
      fontFamily: Type.body,
      color: p.danger,
    } as TextStyle,
    link: {
      fontSize: 14,
      fontFamily: Type.bodyBold,
      color: p.title,
    } as TextStyle,
    dangerLink: {
      fontSize: 14,
      fontFamily: Type.bodyBold,
      color: p.danger,
    } as TextStyle,
    input: {
      borderWidth: 1,
      borderColor: p.border,
      borderRadius: Spacing.two,
      backgroundColor: p.surface,
      color: p.text,
      paddingHorizontal: Spacing.three,
      paddingVertical: Spacing.two,
      fontSize: 16,
      fontFamily: Type.body,
    },
    fieldText: {
      fontSize: 16,
      fontFamily: Type.bodySemibold,
      color: p.text,
    } as TextStyle,
    fieldPlaceholder: {
      fontSize: 16,
      fontFamily: Type.body,
      color: p.textSoft,
    } as TextStyle,
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.two,
    },
    primaryButton: {
      backgroundColor: p.primary,
      borderRadius: Spacing.two,
      paddingVertical: Spacing.three,
      alignItems: "center",
      marginTop: Spacing.two,
    },
    primaryButtonText: {
      fontSize: 14,
      fontFamily: Type.bodyBold,
      color: p.onPrimary,
    } as TextStyle,
    secondaryButton: {
      backgroundColor: p.secondaryBg,
      borderWidth: 1,
      borderColor: p.border,
      borderRadius: Spacing.two,
      paddingVertical: Spacing.two,
      paddingHorizontal: Spacing.three,
      alignItems: "center",
    },
    secondaryButtonText: {
      fontSize: 14,
      fontFamily: Type.bodyBold,
      color: p.title,
    } as TextStyle,
    dangerButton: {
      backgroundColor: p.danger,
      borderRadius: Spacing.two,
      paddingVertical: Spacing.two,
      paddingHorizontal: Spacing.three,
      alignItems: "center",
    },
    dangerButtonText: {
      fontSize: 14,
      fontFamily: Type.bodyBold,
      color: readableOn(p.danger),
    } as TextStyle,
    linkWrap: {
      alignItems: "center",
      paddingVertical: Spacing.two,
    },
    faseOn: {
      fontSize: 14,
      fontFamily: Type.bodyBold,
      color: p.success,
    } as TextStyle,
    faseOff: {
      fontSize: 14,
      fontFamily: Type.body,
      color: p.textSoft,
    } as TextStyle,
    modalOverlay: {
      flex: 1,
      justifyContent: "flex-end",
      backgroundColor: p.scrim,
    },
    modalCard: {
      backgroundColor: p.surface,
      borderColor: p.border,
      borderWidth: 1,
      borderRadius: 16,
      margin: Spacing.three,
      padding: Spacing.three,
      gap: Spacing.two,
    },
  });
}

/** Estilos estáticos neutros (pantallas sin sesión o aún no migradas). */
export const eventStyles = makeEventStyles(NEUTRAL_LIGHT);

type Badge = { pill: ViewStyle; text: TextStyle };

const badgeBase: ViewStyle = {
  borderRadius: 999,
  paddingVertical: 4,
  paddingHorizontal: 12,
  alignSelf: "flex-start",
  borderWidth: 1,
};

/** Pastilla de estado legible con la paleta activa (defecto: neutra clara). */
export function estadoBadge(estado: EventEstado, p: UIPalette = NEUTRAL_LIGHT): Badge {
  switch (estado) {
    case "publicado":
      return {
        pill: { ...badgeBase, backgroundColor: p.primary, borderColor: p.primary },
        text: { fontSize: 13, fontFamily: Type.bodyBold, color: p.onPrimary },
      };
    case "finalizado":
      return {
        pill: { ...badgeBase, backgroundColor: p.success, borderColor: p.success },
        text: { fontSize: 13, fontFamily: Type.bodyBold, color: readableOn(p.success) },
      };
    case "cancelado":
      return {
        pill: { ...badgeBase, backgroundColor: p.danger, borderColor: p.danger },
        text: { fontSize: 13, fontFamily: Type.bodyBold, color: readableOn(p.danger) },
      };
    case "borrador":
    default:
      return {
        pill: { ...badgeBase, backgroundColor: p.secondaryBg, borderColor: p.textSoft },
        text: { fontSize: 13, fontFamily: Type.bodyBold, color: p.text },
      };
  }
}

/**
 * Paleta activa: colores del comité (si hay sesión con comité) sobre el
 * esquema elegido por el usuario (auto/claro/oscuro). Sin comité → neutros.
 */
export function useBrandPalette(): UIPalette {
  const { scheme } = useThemeChoice();
  const { committee } = useCommittee();
  return useMemo(() => {
    const brand: BrandInput = committee
      ? { primary: committee.color_primario, secondary: committee.color_secundario, background: committee.color_fondo }
      : NEUTRAL_BRAND;
    return buildPalette(brand, scheme);
  }, [committee, scheme]);
}

/**
 * Estilos + paleta + badge listos para la pantalla. Reemplaza al import
 * estático `eventStyles as s`:
 *   const { s, p, badge } = useEventStyles();
 */
export function useEventStyles() {
  const p = useBrandPalette();
  const s = useMemo(() => makeEventStyles(p), [p]);
  const badge = useCallback((estado: EventEstado) => estadoBadge(estado, p), [p]);
  return { s, p, badge };
}
