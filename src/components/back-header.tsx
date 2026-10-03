import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";

import { Type } from "@/constants/type";
import { useEventStyles } from "@/features/events/eventStyles";

type BackFallback =
  | "/(admin)"
  | "/(seller)"
  | "/(access)"
  | "/(admin)/ventas"
  | "/(admin)/usuarios"
  | "/(access)/historial"
  | "/(seller)/ventas";

/**
 * Encabezado ← Volver para pantallas secundarias (los headers nativos están
 * ocultos). Usa router.back() y, si no hay a dónde volver, el fallback.
 */
export function BackHeader({ label = "Volver", fallback }: { label?: string; fallback?: BackFallback }) {
  const { p } = useEventStyles();
  function goBack() {
    if (router.canGoBack()) {
      router.back();
    } else if (fallback) {
      router.replace(fallback);
    }
  }
  return (
    <View style={{ paddingVertical: 4 }}>
      <Pressable onPress={goBack} hitSlop={8}>
        <Text style={{ fontSize: 14, fontFamily: Type.bodyBold, color: p.primary }}>
          {"← "}
          {label}
        </Text>
      </Pressable>
    </View>
  );
}
