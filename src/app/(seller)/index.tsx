import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { useAuth } from "@/auth/AuthProvider";
import { ThemeSelector } from "@/branding/ThemeSelector";
import { useEventStyles } from "@/features/events/eventStyles";
import { hasRole } from "@/lib/supabase";

export default function SellerHome() {
  const { s, p } = useEventStyles();
  const { profile, loading, signOut } = useAuth();
  const isAccess = hasRole(profile, "access");

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={p.primary} />
      </View>
    );
  }

  return (
    <View style={s.screen}>
      <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
        <View style={s.scroll}>
          <Text style={s.screenTitle}>Ventas</Text>
          <View style={s.goldRule} />
          <Text style={s.meta}>Hola, {profile?.nombre ?? profile?.usuario}.</Text>

          <Pressable
            onPress={() => router.push("/(seller)/nueva-venta")}
            style={({ pressed }) => [s.primaryButton, { opacity: pressed ? 0.7 : 1 }]}>
            <Text style={s.primaryButtonText}>+ Nueva venta</Text>
          </Pressable>

          <Pressable
            onPress={() => router.push("/(seller)/ventas")}
            style={({ pressed }) => [s.secondaryButton, { opacity: pressed ? 0.7 : 1 }]}>
            <Text style={s.secondaryButtonText}>Mis ventas</Text>
          </Pressable>

          <Pressable
            onPress={() => router.push("/(seller)/cortesia")}
            style={({ pressed }) => [s.secondaryButton, { opacity: pressed ? 0.7 : 1 }]}>
            <Text style={s.secondaryButtonText}>Boletos de cortesía</Text>
          </Pressable>

          <Pressable
            onPress={() => router.push("/(seller)/ahorro")}
            style={({ pressed }) => [s.secondaryButton, { opacity: pressed ? 0.7 : 1 }]}>
            <Text style={s.secondaryButtonText}>Ahorro</Text>
          </Pressable>

          {isAccess ? (
            <Pressable
              onPress={() => router.push("/(access)")}
              style={({ pressed }) => [s.secondaryButton, { opacity: pressed ? 0.7 : 1 }]}>
              <Text style={s.secondaryButtonText}>Control de acceso</Text>
            </Pressable>
          ) : null}

          <ThemeSelector />

          <Pressable onPress={() => signOut()} style={s.linkWrap}>
            <Text style={s.link}>Cerrar sesión</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}
