import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import {
  BarcodeScanningResult,
  CameraView,
  useCameraPermissions,
} from "expo-camera";

import { BackHeader } from "@/components/back-header";
import { getEvent } from "@/features/events/api";
import { useEventStyles } from "@/features/events/eventStyles";
import { validateScan, type ScanResult } from "@/features/access/api";
import { ResultCard } from "@/features/access/ResultCard";
import { useConnectivity } from "@/offline/Connectivity";
import { getOfflineEvent } from "@/offline/repo/events";

export default function EscanearScreen() {
  const { s, p } = useEventStyles();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const { status } = useConnectivity();
  const [permission, requestPermission] = useCameraPermissions();
  const [eventName, setEventName] = useState<string | null>(null);
  const [eventCode, setEventCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Ref anti-doble: los callbacks nativos pueden llegar en ráfaga antes
  // de que el estado `busy` se confirme en un re-render.
  const processing = useRef(false);

  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    getEvent(eventId)
      .then((ev) => {
        if (cancelled) return;
        setEventName(ev?.nombre ?? null);
        setEventCode(ev?.codigo ?? "");
      })
      .catch(() =>
        getOfflineEvent(eventId)
          .then((ev) => {
            if (cancelled) return;
            setEventName(ev?.nombre ?? null);
            setEventCode(ev?.codigo ?? "");
          })
          .catch(() => {
            if (cancelled) return;
            setEventName(null);
            setEventCode("");
          }),
      );
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  async function handleScan(scan: BarcodeScanningResult) {
    if (processing.current || busy || result || !eventId) return;
    processing.current = true;
    setBusy(true);
    setError(null);
    try {
      setResult(await validateScan(scan.data, eventId, status));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      processing.current = false;
    }
  }

  function handleNext() {
    setResult(null);
    setError(null);
  }

  if (Platform.OS === "web") {
    return (
      <View style={s.screen}>
        <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
          <View style={s.scroll}>
            <Text style={s.screenTitle}>Control de acceso</Text>
            <View style={s.goldRule} />
            <BackHeader fallback="/(access)" />
            <Text style={s.meta}>
              El escaneo de QR sólo está disponible en la app de Android. Desde la web puedes
              revisar el historial y los boletos.
            </Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  if (!eventId) {
    return (
      <View style={s.screen}>
        <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
          <View style={s.scroll}>
            <BackHeader fallback="/(access)" />
            <Text style={s.error}>Falta el evento del control. Vuelve y elige un evento.</Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  if (!permission) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={p.primary} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={s.screen}>
        <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
          <View style={s.scroll}>
            <Text style={s.screenTitle}>Control de acceso</Text>
            <View style={s.goldRule} />
            <BackHeader fallback="/(access)" />
            <Text style={s.meta}>
              Se necesita acceso a la cámara para escanear los boletos.
            </Text>
            <Pressable
              onPress={requestPermission}
              style={({ pressed }) => [s.primaryButton, { opacity: pressed ? 0.7 : 1 }]}>
              <Text style={s.primaryButtonText}>Permitir cámara</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  const scanning = !result && !error;

  return (
    <View style={s.screen}>
      <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
        <View style={[s.scroll, { flex: 1 }]}>
          <Text style={s.screenTitle}>Control de acceso</Text>
          <View style={s.goldRule} />
          <BackHeader fallback="/(access)" />
          <Text style={s.meta}>
            {eventName ? `Evento: ${eventName}` : "Coloca el QR dentro del área."}
          </Text>

          {status === "offline" ? (
            <View style={s.card}>
              <Text style={[s.sectionTitle, { color: p.primary }]}>MODO OFFLINE</Text>
              <Text style={s.meta}>
                Validación sin conexión: el resultado se guarda en este dispositivo y quedará
                pendiente de sincronización.
              </Text>
            </View>
          ) : null}

          {scanning ? (
            <View style={[s.card, { padding: 0, overflow: "hidden", maxWidth: 480, alignSelf: "center" }]}>
              <CameraView
                style={{ width: "100%", aspectRatio: 1 }}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                onBarcodeScanned={handleScan}
              />
              <Text style={[s.meta, { padding: 12, textAlign: "center" }]}>
                {busy ? "Validando…" : "Apunta al código QR del boleto."}
              </Text>
              {busy ? <ActivityIndicator color={p.primary} /> : null}
            </View>
          ) : null}

          {result ? <ResultCard result={result} eventName={eventName} eventCode={eventCode} /> : null}

          {result?.offline ? (
            <View style={s.card}>
              <Text style={[s.sectionTitle, { color: p.primary }]}>VALIDACIÓN OFFLINE</Text>
              <Text style={s.meta}>
                {result.ok
                  ? "Entrada registrada localmente y pendiente de sincronización."
                  : "Resultado registrado en este dispositivo."}
              </Text>
              {result.stale ? (
                <Text style={s.error}>Sin sincronizar por más de 12 horas.</Text>
              ) : null}
            </View>
          ) : null}

          {error && !result ? <Text style={s.error}>{error}</Text> : null}

          {!scanning ? (
            <Pressable
              onPress={handleNext}
              style={({ pressed }) => [s.primaryButton, { opacity: pressed ? 0.7 : 1 }]}>
              <Text style={s.primaryButtonText}>Escanear siguiente</Text>
            </Pressable>
          ) : null}
        </View>
      </SafeAreaView>
    </View>
  );
}
