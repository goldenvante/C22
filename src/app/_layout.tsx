import { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { DarkTheme, DefaultTheme, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import type { ReactNode } from "react";

import { AuthProvider, useAuth } from "@/auth/AuthProvider";
import { ThemeChoiceProvider, useThemeChoice } from "@/branding/ThemeChoice";
import { hasRole } from "@/lib/supabase";

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
      // Registro inicial del comité: accesible sin sesión (pantalla única).
      if (group === "setup") return;
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
    // Grupos permitidos según roles (un usuario puede tener seller+access).
    const allowed = hasRole(profile, "admin")
      ? ["(admin)"]
      : [
          ...(hasRole(profile, "seller") ? ["(seller)"] : []),
          ...(hasRole(profile, "access") ? ["(access)"] : []),
        ];
    if (allowed.length === 0) {
      router.replace("/");
      return;
    }
    if (!group || !allowed.includes(group)) {
      // Destino principal: admin > seller > access.
      router.replace(
        allowed.includes("(admin)")
          ? "/(admin)"
          : allowed.includes("(seller)")
            ? "/(seller)"
            : "/(access)",
      );
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
      <Stack.Screen name="setup" />
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
        <Stack.Screen name="(admin)/ahorro" />
        <Stack.Screen name="(seller)/index" />
        <Stack.Screen name="(seller)/nueva-venta" />
        <Stack.Screen name="(seller)/ventas" />
        <Stack.Screen name="(seller)/ventas/[id]" />
        <Stack.Screen name="(seller)/boleto/[id]" />
        <Stack.Screen name="(seller)/cortesia" />
        <Stack.Screen name="(seller)/ahorro" />
        <Stack.Screen name="(access)/index" />
        <Stack.Screen name="(access)/ahorro" />
        <Stack.Screen name="(access)/historial" />
        <Stack.Screen name="(access)/historial/[id]" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <ThemeChoiceProvider>
      <AppTheme>
        <AuthProvider>
          <RouteGate />
          <AuthStack />
        </AuthProvider>
      </AppTheme>
    </ThemeChoiceProvider>
  );
}

/** Tema de navegación según la elección del usuario (auto/claro/oscuro). */
function AppTheme({ children }: { children: ReactNode }) {
  const { scheme } = useThemeChoice();
  return <ThemeProvider value={scheme === "dark" ? DarkTheme : DefaultTheme}>{children}</ThemeProvider>;
}
