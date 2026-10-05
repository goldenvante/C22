import { useEffect } from "react";
import { View } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { DarkTheme, DefaultTheme, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import type { ReactNode } from "react";

/**
 * Cada peso se importa por su archivo: el `index.js` de estos paquetes evalúa
 * un `require` por variante, así que importar desde la raíz empaqueta las ~25
 * fuentes (≈2 MB) en vez de estas 6.
 */
const Manrope_800ExtraBold = require("@expo-google-fonts/manrope/800ExtraBold/Manrope_800ExtraBold.ttf");
const Manrope_600SemiBold = require("@expo-google-fonts/manrope/600SemiBold/Manrope_600SemiBold.ttf");
const Inter_400Regular = require("@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf");
const Inter_500Medium = require("@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf");
const Inter_600SemiBold = require("@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf");
const Inter_700Bold = require("@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf");

import { AuthProvider, useAuth } from "@/auth/AuthProvider";
import { ThemeChoiceProvider, useThemeChoice } from "@/branding/ThemeChoice";
import { MONARQ } from "@/branding/palette";
import { BottomBar } from "@/components/nav/BottomBar";
import { MaxContentWidth } from "@/constants/theme";
import { useBrandPalette } from "@/features/events/eventStyles";
import { hasRole } from "@/lib/supabase";
import { ConnectivityProvider } from "@/offline/Connectivity";
import { SyncProvider } from "@/offline/SyncProvider";

SplashScreen.preventAutoHideAsync();

function RouteGate() {
  const { session, profile, loading, requiresPasswordChange } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    SplashScreen.hideAsync().catch(() => undefined);
    const group = segments[0];
    if (group === "reset-password") return;
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
    // El admin administra Y vende: su panel es (admin) y el flujo de venta
    // compartido (nueva-venta, boleto, detalle) vive en (seller), al que
    // también tiene acceso. El destino principal sigue siendo (admin).
    const allowed = hasRole(profile, "admin")
      ? ["(admin)", "(seller)", "(access)"]
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
  const p = useBrandPalette();
  const authed = !!session && !requiresPasswordChange;
  if (loading) return null;
  return (
    <View style={{ flex: 1, alignItems: "center", backgroundColor: p.background }}>
      <View style={{ flex: 1, width: "100%", maxWidth: MaxContentWidth }}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="setup" />
          <Stack.Screen name="cambiar-password" />
          <Stack.Screen name="reset-password" />
          <Stack.Protected guard={authed}>
            <Stack.Screen name="(admin)/index" />
            <Stack.Screen name="(admin)/events" />
            <Stack.Screen name="(admin)/events/new" />
            <Stack.Screen name="(admin)/events/[id]" />
            <Stack.Screen name="(admin)/events/[id]/edit" />
            <Stack.Screen name="(admin)/events/[id]/offline" />
            <Stack.Screen name="(admin)/usuarios" />
            <Stack.Screen name="(admin)/usuarios/nuevo" />
            <Stack.Screen name="(admin)/ventas" />
            <Stack.Screen name="(admin)/ventas/[id]" />
            <Stack.Screen name="(admin)/cortesias" />
            <Stack.Screen name="(admin)/reporte" />
            <Stack.Screen name="(admin)/ahorro" />
            <Stack.Screen name="(admin)/boletos" />
            <Stack.Screen name="(admin)/configuracion" />
            <Stack.Screen name="(seller)/index" />
            <Stack.Screen name="(seller)/nueva-venta" />
            <Stack.Screen name="(seller)/events" />
            <Stack.Screen name="(seller)/boletos" />
            <Stack.Screen name="(seller)/ventas" />
            <Stack.Screen name="(seller)/ventas/[id]" />
            <Stack.Screen name="(seller)/boleto/[id]" />
            <Stack.Screen name="(seller)/cortesia" />
            <Stack.Screen name="(seller)/ahorro" />
            <Stack.Screen name="(seller)/configuracion" />
            <Stack.Screen name="(access)/index" />
            <Stack.Screen name="(access)/ahorro" />
            <Stack.Screen name="(access)/historial" />
            <Stack.Screen name="(access)/historial/[id]" />
            <Stack.Screen name="(access)/configuracion" />
          </Stack.Protected>
        </Stack>
        {authed ? <BottomBar /> : null}
      </View>
    </View>
  );
}

export default function RootLayout() {
  /**
   * Manrope/Inter se cargan ANTES de montar el árbol: si no, el wordmark y
   * las tarjetas de inicio caerían al tipo del sistema y el splash tendría
   * que esconderse con texto ya dibujado en otra fuente.
   */
  const [fontsLoaded, fontsError] = useFonts({
    Manrope_800ExtraBold,
    Manrope_600SemiBold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  if (!fontsLoaded && !fontsError) {
    return <View style={{ flex: 1, backgroundColor: MONARQ.background }} />;
  }

  return (
    <ThemeChoiceProvider>
      <ConnectivityProvider>
        <AppTheme>
          <AuthProvider>
            <SyncProvider>
              <RouteGate />
              <AuthStack />
            </SyncProvider>
          </AuthProvider>
        </AppTheme>
      </ConnectivityProvider>
    </ThemeChoiceProvider>
  );
}

/** Tema de navegación según la elección del usuario (auto/claro/oscuro). */
function AppTheme({ children }: { children: ReactNode }) {
  const { scheme } = useThemeChoice();
  return <ThemeProvider value={scheme === "dark" ? DarkTheme : DefaultTheme}>{children}</ThemeProvider>;
}
