import { useEffect } from "react";
import { View } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { DarkTheme, DefaultTheme, ThemeProvider } from "expo-router";
import Head from "expo-router/head";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import type { ReactNode } from "react";

/**
 * Cada peso se importa por su archivo: el `index.js` de estos paquetes evalúa
 * un `require` por variante, así que importar desde la raíz empaqueta las ~25
 * fuentes (≈2 MB) en vez de estas. Las últimas 29 son las del catálogo del
 * título del boleto (constants/type.ts: TICKET_FONTS).
 */
const Manrope_800ExtraBold = require("@expo-google-fonts/manrope/800ExtraBold/Manrope_800ExtraBold.ttf");
const Manrope_600SemiBold = require("@expo-google-fonts/manrope/600SemiBold/Manrope_600SemiBold.ttf");
const Inter_400Regular = require("@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf");
const Inter_500Medium = require("@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf");
const Inter_600SemiBold = require("@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf");
const Inter_700Bold = require("@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf");

const BebasNeue_400Regular = require("@expo-google-fonts/bebas-neue/400Regular/BebasNeue_400Regular.ttf");
const KalniaGlaze_700Bold = require("@expo-google-fonts/kalnia-glaze/700Bold/KalniaGlaze_700Bold.ttf");
const Montserrat_700Bold = require("@expo-google-fonts/montserrat/700Bold/Montserrat_700Bold.ttf");
const Oswald_600SemiBold = require("@expo-google-fonts/oswald/600SemiBold/Oswald_600SemiBold.ttf");
const PlayfairDisplay_700Bold = require("@expo-google-fonts/playfair-display/700Bold/PlayfairDisplay_700Bold.ttf");
const Poppins_700Bold = require("@expo-google-fonts/poppins/700Bold/Poppins_700Bold.ttf");
const Caveat_700Bold = require("@expo-google-fonts/caveat/700Bold/Caveat_700Bold.ttf");
const HennyPenny_400Regular = require("@expo-google-fonts/henny-penny/400Regular/HennyPenny_400Regular.ttf");
const Lobster_400Regular = require("@expo-google-fonts/lobster/400Regular/Lobster_400Regular.ttf");
const Merienda_700Bold = require("@expo-google-fonts/merienda/700Bold/Merienda_700Bold.ttf");
const MountainsofChristmas_700Bold = require("@expo-google-fonts/mountains-of-christmas/700Bold/MountainsofChristmas_700Bold.ttf");
const Pacifico_400Regular = require("@expo-google-fonts/pacifico/400Regular/Pacifico_400Regular.ttf");
const AlexBrush_400Regular = require("@expo-google-fonts/alex-brush/400Regular/AlexBrush_400Regular.ttf");
const Allura_400Regular = require("@expo-google-fonts/allura/400Regular/Allura_400Regular.ttf");
const DancingScript_700Bold = require("@expo-google-fonts/dancing-script/700Bold/DancingScript_700Bold.ttf");
const GreatVibes_400Regular = require("@expo-google-fonts/great-vibes/400Regular/GreatVibes_400Regular.ttf");
const Italianno_400Regular = require("@expo-google-fonts/italianno/400Regular/Italianno_400Regular.ttf");
const Parisienne_400Regular = require("@expo-google-fonts/parisienne/400Regular/Parisienne_400Regular.ttf");
const PinyonScript_400Regular = require("@expo-google-fonts/pinyon-script/400Regular/PinyonScript_400Regular.ttf");
const Satisfy_400Regular = require("@expo-google-fonts/satisfy/400Regular/Satisfy_400Regular.ttf");
const Sacramento_400Regular = require("@expo-google-fonts/sacramento/400Regular/Sacramento_400Regular.ttf");
const Tangerine_700Bold = require("@expo-google-fonts/tangerine/700Bold/Tangerine_700Bold.ttf");
const BerkshireSwash_400Regular = require("@expo-google-fonts/berkshire-swash/400Regular/BerkshireSwash_400Regular.ttf");
const EmilysCandy_400Regular = require("@expo-google-fonts/emilys-candy/400Regular/EmilysCandy_400Regular.ttf");
const FontdinerSwanky_400Regular = require("@expo-google-fonts/fontdiner-swanky/400Regular/FontdinerSwanky_400Regular.ttf");
const NewRocker_400Regular = require("@expo-google-fonts/new-rocker/400Regular/NewRocker_400Regular.ttf");
const Nosifer_400Regular = require("@expo-google-fonts/nosifer/400Regular/Nosifer_400Regular.ttf");
const RubikWetPaint_400Regular = require("@expo-google-fonts/rubik-wet-paint/400Regular/RubikWetPaint_400Regular.ttf");
const Lacquer_400Regular = require("@expo-google-fonts/lacquer/400Regular/Lacquer_400Regular.ttf");

import { AuthProvider, useAuth } from "@/auth/AuthProvider";
import { ThemeChoiceProvider, useThemeChoice } from "@/branding/ThemeChoice";
import { MONARQ } from "@/branding/palette";
import { BottomBar } from "@/components/nav/BottomBar";
import { MaxContentWidth } from "@/constants/theme";
import { useBrandPalette } from "@/features/events/eventStyles";
import { useGate } from "@/features/gate/useGate";
import { hasRole } from "@/lib/supabase";
import { ConnectivityProvider } from "@/offline/Connectivity";
import { SyncProvider } from "@/offline/SyncProvider";

SplashScreen.preventAutoHideAsync();

function RouteGate() {
  const { session, profile, loading, requiresPasswordChange } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const gate = useGate();

  useEffect(() => {
    if (loading || gate === null) return;
    SplashScreen.hideAsync().catch(() => undefined);
    const group = segments[0];
    // Código de acceso por comité: bloquea TODA la app (login y registro
    // incluidos) hasta pasar una sola vez por /access-code.
    if (!gate) {
      if (group !== "access-code") router.replace("/access-code");
      return;
    }
    if (group === "access-code") {
      router.replace("/");
      return;
    }
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
  }, [loading, gate, session, profile, requiresPasswordChange, segments, router]);

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
  const { session, profile, loading, requiresPasswordChange } = useAuth();
  const p = useBrandPalette();
  const authed = !!session && !requiresPasswordChange;
  const gate = useGate();
  const segments = useSegments();
  if (loading || gate === null) return null;
  // Sin el código resuelto no se pinta login ni registro: sólo el gate.
  if (!gate && segments[0] !== "access-code") return null;
  return (
    <View style={{ flex: 1, alignItems: "center", backgroundColor: p.background }}>
      <View style={{ flex: 1, width: "100%", maxWidth: MaxContentWidth }}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="access-code" />
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
    BebasNeue_400Regular,
    KalniaGlaze_700Bold,
    Montserrat_700Bold,
    Oswald_600SemiBold,
    PlayfairDisplay_700Bold,
    Poppins_700Bold,
    Caveat_700Bold,
    HennyPenny_400Regular,
    Lobster_400Regular,
    Merienda_700Bold,
    MountainsofChristmas_700Bold,
    Pacifico_400Regular,
    AlexBrush_400Regular,
    Allura_400Regular,
    DancingScript_700Bold,
    GreatVibes_400Regular,
    Italianno_400Regular,
    Parisienne_400Regular,
    PinyonScript_400Regular,
    Satisfy_400Regular,
    Sacramento_400Regular,
    Tangerine_700Bold,
    BerkshireSwash_400Regular,
    EmilysCandy_400Regular,
    FontdinerSwanky_400Regular,
    NewRocker_400Regular,
    Nosifer_400Regular,
    RubikWetPaint_400Regular,
    Lacquer_400Regular,
  });

  if (!fontsLoaded && !fontsError) {
    return <View style={{ flex: 1, backgroundColor: MONARQ.background }} />;
  }

  return (
    <>
      <Head>
        <title>MONARQ</title>
      </Head>
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
    </>
  );
}

/** Tema de navegación según la elección del usuario (auto/claro/oscuro). */
function AppTheme({ children }: { children: ReactNode }) {
  const { scheme } = useThemeChoice();
  return <ThemeProvider value={scheme === "dark" ? DarkTheme : DefaultTheme}>{children}</ThemeProvider>;
}
