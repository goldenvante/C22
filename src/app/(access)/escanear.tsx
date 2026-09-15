import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import {
  BarcodeScanningResult,
  CameraView,
  useCameraPermissions,
} from "expo-camera";

import { BackHeader } from "@/components/back-header";
import { C22 } from "@/constants/theme";
import { getEvent } from "@/features/events/api";
import { eventStyles as s } from "@/features/events/eventStyles";
import { validateTicket, type ValidateResult } from "@/features/access/api";
import { formatFolio } from "@/features/sales/types";

function FaseLine({ fase }: { fase: string | null }) {
  if (!fase) return null;
  return <Text style={s.meta}>Etapa: {fase}</Text>;
}

function ResultCard({ result, eventName }: { result: ValidateResult; eventName: string | null }) {
  switch (result.code) {
    case "VALIDO":
      return (
        <View style={s.card}>
          <Text style={[s.sectionTitle, { color: C22.success }]}>✓ ACCESO VÁLIDO</Text>
          <Text style={[s.screenTitle, { fontSize: 36 }]}>
            {result.folio !== null ? formatFolio(result.folio) : "—"}
          </Text>
          {eventName ? <Text style={s.body}>{eventName}</Text> : null}
          <FaseLine fase={result.fase} />
          <Text style={s.body}>{result.comprador ?? ""}</Text>
          <Text style={s.meta}>Boleto utilizado correctamente.</Text>
        </View>
      );
    case "YA_UTILIZADO":
      return (
        <View style={s.card}>
          <Text style={[s.sectionTitle, { color: C22.wine }]}>⚠ BOLETO YA UTILIZADO</Text>
          <Text style={[s.screenTitle, { fontSize: 36 }]}>
            {result.folio !== null ? formatFolio(result.folio) : "—"}
          </Text>
          <FaseLine fase={result.fase} />
          <Text style={s.meta}>Este boleto ya registró su entrada.</Text>
        </View>
      );
    case "CANCELADO":
      return (
        <View style={s.card}>
          <Text style={[s.sectionTitle, { color: C22.danger }]}>✕ BOLETO CANCELADO</Text>
          <Text style={[s.screenTitle, { fontSize: 36 }]}>
            {result.folio !== null ? formatFolio(result.folio) : "—"}
          </Text>
          <FaseLine fase={result.fase} />
          <Text style={s.meta}>Este boleto fue cancelado y no permite entrada.</Text>
        </View>
      );
    case "EVENTO_INCORRECTO":
      return (
        <View style={s.card}>
          <Text style={[s.sectionTitle, { color: C22.danger }]}>✕ BOLETO DE OTRO EVENTO</Text>
          {result.folio !== null ? (
            <Text style={[s.screenTitle, { fontSize: 36 }]}>{formatFolio(result.folio)}</Text>
          ) : null}
          <FaseLine fase={result.fase} />
          <Text style={s.meta}>Este boleto no pertenece al evento del control.</Text>
        </View>
      );
    case "NO_AUTORIZADO":
      return (
        <View style={s.card}>
          <Text style={[s.sectionTitle, { color: C22.danger }]}>✕ SIN AUTORIZACIÓN</Text>
          <Text style={s.meta}>Tu sesión no tiene permiso. Vuelve e inicia sesión de nuevo.</Text>
        </View>
      );
    case "NO_EXISTE":
    default:
      return (
        <View style={s.card}>
          <Text style={[s.sectionTitle, { color: C22.danger }]}>✕ BOLETO NO VÁLIDO</Text>
          <Text style={s.meta}>El código no corresponde a ningún boleto.</Text>
        </View>
      );
  }
}

export default function EscanearScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const [eventName, setEventName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ValidateResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Ref anti-doble: los callbacks nativos pueden llegar en ráfaga antes
  // de que el estado `busy` se confirme en un re-render.
  const processing = useRef(false);

  useEffect(() => {
    if (!eventId) return;
    getEvent(eventId)
      .then((ev) => setEventName(ev?.nombre ?? null))
      .catch(() => setEventName(null));
  }, [eventId]);

  async function handleScan(scan: BarcodeScanningResult) {
    if (processing.current || busy || result || !eventId) return;
    processing.current = true;
    setBusy(true);
    setError(null);
    try {
      setResult(await validateTicket(scan.data, eventId));
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
        <ActivityIndicator color={C22.wine} />
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

          {scanning ? (
            <View style={[s.card, { padding: 0, overflow: "hidden" }]}>
              <CameraView
                style={{ width: "100%", aspectRatio: 1 }}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                onBarcodeScanned={handleScan}
              />
              <Text style={[s.meta, { padding: 12, textAlign: "center" }]}>
                {busy ? "Validando…" : "Apunta al código QR del boleto."}
              </Text>
              {busy ? <ActivityIndicator color={C22.wine} /> : null}
            </View>
          ) : null}

          {result ? <ResultCard result={result} eventName={eventName} /> : null}
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
