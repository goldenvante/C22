import { useMemo } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { UIPalette } from "@/branding/palette";
import { Type } from "@/constants/theme";
import { useBrandPalette } from "@/features/events/eventStyles";
import { FlagIcon } from "./Icons";
import { MenuGlyph } from "./MenuGlyph";

type Props = {
  /** Nombre del comité (tenant). Sin comité → solo la marca. */
  committee?: string | null;
  /** "Bienvenido, X". */
  welcome?: string | null;
  /** Logo del comité (registrado en /setup). Se pinta junto al saludo. */
  logo?: string | null;
  onMenu: () => void;
};

const makeStyles = (p: UIPalette) =>
  StyleSheet.create({
    bar: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingTop: 8,
    },
    center: {
      alignItems: "center",
      paddingBottom: 4,
    },
    wordmark: {
      fontFamily: Type.display,
      fontSize: 26,
      letterSpacing: 5,
      textTransform: "uppercase",
      color: p.title,
    },
    rule: {
      width: 52,
      height: 2,
      borderRadius: 2,
      backgroundColor: p.accent,
      marginVertical: 10,
    },
    committee: {
      fontFamily: Type.body,
      fontSize: 12,
      color: p.textSoft,
    },
    pill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginTop: 14,
      paddingVertical: 12,
      paddingHorizontal: 20,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: p.border,
    },
    pillText: {
      fontFamily: Type.bodyBold,
      fontSize: 15,
      color: p.title,
    },
    pillLogo: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: p.surface,
    },
  });

/**
 * Encabezado de inicio: marca MONARQ centrada, regla de acento, comité y
 * pastilla de bienvenida con bandera. Único elemento interactivo: el menú de
 * tres líneas (esquina superior derecha), que abre el sidebar.
 *
 * Conserva la tipografía MONARQ (el wordmark es del producto), pero pinta con
 * la paleta activa: el tema elegido y los colores del comité mandan, como en
 * el resto de la app.
 */
export function HomeHeader({ committee, welcome, logo, onMenu }: Props) {
  const p = useBrandPalette();
  const styles = useMemo(() => makeStyles(p), [p]);
  const name = (committee ?? "").trim();

  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={{ backgroundColor: p.background }}>
      <View style={styles.bar}>
        <View style={{ flex: 1 }} />
        <Pressable
          onPress={onMenu}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Abrir menú"
          style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1, padding: 4 }]}>
          <MenuGlyph color={p.title} />
        </Pressable>
      </View>

      <View style={styles.center}>
        <Text accessibilityRole="header" style={styles.wordmark}>
          MONARQ
        </Text>
        <View style={styles.rule} />
        {name ? <Text style={styles.committee}>{name}</Text> : null}
        {welcome ? (
          <View style={styles.pill}>
            {logo ? (
              <Image source={{ uri: logo }} style={styles.pillLogo} />
            ) : (
              <FlagIcon size={16} color={p.accent} strokeWidth={1.6} />
            )}
            <Text style={styles.pillText}>{welcome}</Text>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}
