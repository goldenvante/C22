import { StyleSheet, type TextStyle, type ViewStyle } from "react-native";

import { C22, Spacing } from "@/constants/theme";
import type { EventEstado } from "./types";

/**
 * Estilos del módulo de Eventos. Todos los colores son C22 explícitos
 * (fondo cream, texto ink) para no depender del modo del sistema.
 * Sin #000000 ni #FFFFFF como colores principales.
 */
export const eventStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C22.cream,
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
    backgroundColor: C22.cream,
  },
  card: {
    backgroundColor: C22.creamLight,
    borderColor: C22.wine,
    borderWidth: 1,
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: C22.wine,
  } as TextStyle,
  sectionTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: C22.wine,
  } as TextStyle,
  goldRule: {
    height: 3,
    width: 64,
    borderRadius: 2,
    backgroundColor: C22.gold,
  } as ViewStyle,
  body: {
    fontSize: 16,
    lineHeight: 24,
    color: C22.ink,
  } as TextStyle,
  small: {
    fontSize: 14,
    lineHeight: 20,
    color: C22.ink,
  } as TextStyle,
  smallBold: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
    color: C22.ink,
  } as TextStyle,
  label: {
    fontSize: 14,
    fontWeight: "700",
    color: C22.ink,
    marginTop: Spacing.one,
  } as TextStyle,
  meta: {
    fontSize: 14,
    lineHeight: 20,
    color: C22.inkSoft,
  } as TextStyle,
  error: {
    fontSize: 14,
    lineHeight: 20,
    color: C22.danger,
  } as TextStyle,
  link: {
    fontSize: 14,
    fontWeight: "700",
    color: C22.wine,
  } as TextStyle,
  dangerLink: {
    fontSize: 14,
    fontWeight: "700",
    color: C22.danger,
  } as TextStyle,
  input: {
    borderWidth: 1,
    borderColor: C22.wine,
    borderRadius: Spacing.two,
    backgroundColor: C22.creamLight,
    color: C22.ink,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  fieldText: {
    fontSize: 16,
    fontWeight: "600",
    color: C22.ink,
  } as TextStyle,
  fieldPlaceholder: {
    fontSize: 16,
    color: C22.inkSoft,
  } as TextStyle,
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  primaryButton: {
    backgroundColor: C22.wine,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: "center",
    marginTop: Spacing.two,
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: C22.cream,
  } as TextStyle,
  secondaryButton: {
    backgroundColor: C22.softPink,
    borderWidth: 1,
    borderColor: C22.wine,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    alignItems: "center",
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: C22.wine,
  } as TextStyle,
  dangerButton: {
    backgroundColor: C22.danger,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    alignItems: "center",
  },
  dangerButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: C22.cream,
  } as TextStyle,
  linkWrap: {
    alignItems: "center",
    paddingVertical: Spacing.two,
  },
  faseOn: {
    fontSize: 14,
    fontWeight: "700",
    color: C22.success,
  } as TextStyle,
  faseOff: {
    fontSize: 14,
    color: C22.inkSoft,
  } as TextStyle,
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(58,41,40,0.55)",
  },
  modalCard: {
    backgroundColor: C22.creamLight,
    borderColor: C22.wine,
    borderWidth: 1,
    borderRadius: 16,
    margin: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
});

type Badge = { pill: ViewStyle; text: TextStyle };

const badgeBase: ViewStyle = {
  borderRadius: 999,
  paddingVertical: 4,
  paddingHorizontal: 12,
  alignSelf: "flex-start",
  borderWidth: 1,
};

/** Pastilla de estado legible: fondo sólido + texto cream (o borde para borrador). */
export function estadoBadge(estado: EventEstado): Badge {
  switch (estado) {
    case "publicado":
      return {
        pill: { ...badgeBase, backgroundColor: C22.wine, borderColor: C22.wine },
        text: { fontSize: 13, fontWeight: "700", color: C22.cream },
      };
    case "finalizado":
      return {
        pill: { ...badgeBase, backgroundColor: C22.success, borderColor: C22.success },
        text: { fontSize: 13, fontWeight: "700", color: C22.cream },
      };
    case "cancelado":
      return {
        pill: { ...badgeBase, backgroundColor: C22.danger, borderColor: C22.danger },
        text: { fontSize: 13, fontWeight: "700", color: C22.cream },
      };
    case "borrador":
    default:
      return {
        pill: { ...badgeBase, backgroundColor: C22.softPink, borderColor: C22.inkSoft },
        text: { fontSize: 13, fontWeight: "700", color: C22.ink },
      };
  }
}
