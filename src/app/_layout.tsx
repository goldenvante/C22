import { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { DarkTheme, DefaultTheme, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useColorScheme } from "react-native";

import { AuthProvider, useAuth } from "@/auth/AuthProvider";

SplashScreen.preventAutoHideAsync();

function RouteGate() {
  const { session, profile, loading, requiresPasswordChange } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    SplashScreen.hideAsync().catch(() => undefined);
    const group = segments[0];
    if (!session) {
      if (group !== undefined) router.replace("/");
      return;
    }
    // Cambio obligatorio pendiente: solo /cambiar-password es alcanzable.
    if (requiresPasswordChange) {
      if (group !== "cambiar-password") router.replace("/cambiar-password");
      return;
    }
    // Sin flag pero parado en /cambiar-password: volver al flujo normal.
    // Sin perfil no hay destino por rol; "/" evita una pantalla varada.
    if (group === "cambiar-password" && !profile) {
      router.replace("/");
      return;
    }
    if (!profile) return;
    if (profile.rol === "admin") {
      if (group !== "(admin)") router.replace("/(admin)");
    } else if (profile.rol === "seller") {
      if (group !== "(seller)") router.replace("/(seller)");
    } else {
      if (group !== "(access)") router.replace("/(access)");
    }
  }, [loading, session, profile, requiresPasswordChange, segments, router]);

  return null;
}

/**
 * Las rutas autenticadas viven dentro de <Stack.Protected>: cuando el guard
 * es false desaparecen REALMENTE del navegador (a diferencia de declarar
 * <Stack.Screen>, que solo ordena). Sin sesión o con cambio obligatorio
 * pendiente, ninguna ruta de grupo existe y es imposible quedarse en ellas.
 * El RouteGate conserva la dirección por rol y /cambiar-password.
 */
function AuthStack() {
  const { session, loading, requiresPasswordChange } = useAuth();
  const authed = !!session && !requiresPasswordChange;
  if (loading) return null;
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="cambiar-password" />
      <Stack.Protected guard={authed}>
        <Stack.Screen name="(admin)/index" />
        <Stack.Screen name="(admin)/events/new" />
        <Stack.Screen name="(admin)/events/[id]" />
        <Stack.Screen name="(admin)/events/[id]/edit" />
        <Stack.Screen name="(admin)/usuarios" />
        <Stack.Screen name="(admin)/usuarios/nuevo" />
        <Stack.Screen name="(admin)/ventas" />
        <Stack.Screen name="(admin)/ventas/[id]" />
        <Stack.Screen name="(admin)/cortesias" />
        <Stack.Screen name="(admin)/reporte" />
        <Stack.Screen name="(seller)/index" />
        <Stack.Screen name="(seller)/nueva-venta" />
        <Stack.Screen name="(seller)/ventas" />
        <Stack.Screen name="(seller)/ventas/[id]" />
        <Stack.Screen name="(seller)/boleto/[id]" />
        <Stack.Screen name="(seller)/cortesia" />
        <Stack.Screen name="(access)/index" />
        <Stack.Screen name="(access)/historial" />
        <Stack.Screen name="(access)/historial/[id]" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <AuthProvider>
        <RouteGate />
        <AuthStack />
      </AuthProvider>
    </ThemeProvider>
  );
}
