import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSegments } from "expo-router";

import { useAuth } from "@/auth/AuthProvider";
import type { UIPalette } from "@/branding/palette";
import { Type } from "@/constants/theme";
import { useBrandPalette } from "@/features/events/eventStyles";
import { hasRole } from "@/lib/supabase";
import { NavIcon, type IconName } from "./Icons";
import { homeGroup, homeHref, replaceRoute } from "./navModel";

type TabKey = "home" | "config" | "none";

const makeStyles = (p: UIPalette) =>
  StyleSheet.create({
    bar: {
      borderTopWidth: 1,
      borderTopColor: p.border,
      backgroundColor: p.surface,
    },
    row: {
      flexDirection: "row",
    },
    tab: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 8,
      gap: 4,
    },
    dot: {
      width: 4,
      height: 4,
      borderRadius: 2,
    },
    label: {
      fontFamily: Type.bodySemibold,
      fontSize: 14,
      textAlign: "center",
    },
  });

/**
 * Barra inferior: Inicio (casa) siempre; Config. evento (engranaje) SOLO para
 * admin, y en ese caso apunta a la configuración del evento (la lista
 * /(admin)/events), no a los ajustes genéricos de la app. Para seller y
 * access el segundo tab desaparece.
 *
 * Se monta UNA vez en el shell autenticado, así que acompaña a todas las
 * pantallas sin tocar sus layouts. El grupo actual se lee de los segmentos.
 */
export function BottomBar() {
  const { profile, loading } = useAuth();
  const segments = useSegments();
  const p = useBrandPalette();
  const styles = useMemo(() => makeStyles(p), [p]);

  if (loading || !profile) return null;

  const isAdmin = hasRole(profile, "admin");

  // Los segmentos se comparan como texto: evitan depender de los tipos
  // generados de rutas (que se regeneran al compilar con Metro).
  const seg0 = String(segments[0] ?? "");
  const seg1 = String(segments[1] ?? "");
  const isConfig = seg0 === "(admin)" && seg1 === "events";
  const isHome = seg0 === homeGroup(profile) && !isConfig;
  const active: TabKey = isConfig ? "config" : isHome ? "home" : "none";

  const tabs: { key: TabKey; label: string; href: string; icon: IconName }[] = [
    { key: "home", label: "Inicio", href: homeHref(profile), icon: "home" },
    ...(isAdmin
      ? [
          {
            key: "config" as TabKey,
            label: "Config. evento",
            href: "/(admin)/events",
            icon: "gear" as IconName,
          },
        ]
      : []),
  ];

  return (
    <View style={styles.bar}>
      <SafeAreaView edges={["bottom"]}>
        <View style={styles.row}>
          {tabs.map((tab) => {
            const on = active === tab.key;
            const tint = on ? p.title : p.textSoft;
            return (
              <Pressable
                key={tab.key}
                onPress={() => replaceRoute(tab.href)}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                style={({ pressed }) => [
                  styles.tab,
                  { opacity: pressed ? 0.7 : 1 },
                ]}>
                {/* Reserva el hueco del punto para que el ícono no salte. */}
                <View style={[styles.dot, { backgroundColor: on ? p.accent : "transparent" }]} />
                <NavIcon name={tab.icon} size={20} color={tint} strokeWidth={1.6} />
                <Text style={[styles.label, { color: tint }]} numberOfLines={1}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </SafeAreaView>
    </View>
  );
}
