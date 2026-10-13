import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { captureRef } from "react-native-view-shot";

import { BackHeader } from "@/components/back-header";
import { useCommittee } from "@/branding/useCommittee";
import { useEventStyles } from "@/features/events/eventStyles";
import { getSale } from "@/features/sales/api";
import { BoletoCard } from "@/features/sales/BoletoCard";
import { MediaLibrary, Sharing } from "@/features/sales/media";
import type { SaleTicket } from "@/features/sales/types";

export default function BoletoScreen() {
  const { s, p } = useEventStyles();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { committee } = useCommittee();
  const [sale, setSale] = useState<SaleTicket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState<"save" | "share" | null>(null);
  const cardRef = useRef<View>(null);

  const load = useCallback(async () => {
    if (!id) {
      setError("Boleto no válido.");
      setLoading(false);
      return;
    }
    try {
      setError(null);
      const found = await getSale(id);
      if (!found) setError("El boleto no existe.");
      setSale(found);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  /** Captura SOLO la tarjeta del boleto (ya renderizada con portada y QR). */
  async function captureTicket(): Promise<string> {
    return captureRef(cardRef, {
      format: "png",
      quality: 1,
      result: "tmpfile",
      width: 1080,
      height: 1920,
    });
  }

  async function handleSave() {
    if (working) return;
    setWorking("save");
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permiso necesario", "Permite el acceso a Fotos para guardar el boleto.");
        return;
      }
      const uri = await captureTicket();
      await MediaLibrary.Asset.create(uri);
      Alert.alert("Guardado", "El boleto se guardó en tus Fotos.");
    } catch (e) {
      Alert.alert("No se pudo guardar", (e as Error).message);
    } finally {
      setWorking(null);
    }
  }

  async function handleShare() {
    if (working) return;
    setWorking("share");
    try {
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert("No disponible", "Este dispositivo no puede compartir.");
        return;
      }
      const uri = await captureTicket();
      await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: "Compartir boleto" });
    } catch (e) {
      Alert.alert("No se pudo compartir", (e as Error).message);
    } finally {
      setWorking(null);
    }
  }

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
        <ScrollView contentContainerStyle={s.scroll}>
          <BackHeader fallback="/(seller)/ventas" />
          {error && !sale ? (
            <Text style={s.error}>{error}</Text>
          ) : sale ? (
            <>
              <BoletoCard
                sale={sale}
                committeeName={committee?.nombre}
                committeeFacultad={committee?.facultad}
                committeeTitleFont={committee?.titulo_fuente}
                committeeTitleSize={committee?.titulo_tamano}
                ref={cardRef}
              />

              {sale.estado === "CANCELADO" ? (
                <Text style={s.error}>
                  Este boleto está cancelado y no permite entrada. La validación la
                  decide el control de acceso.
                </Text>
              ) : (
                <Text style={s.meta}>
                  ⓘ Presenta este boleto en el acceso del evento. El código QR es único
                  e intransferible.
                </Text>
              )}

              <Pressable
                onPress={handleSave}
                disabled={working !== null}
                style={({ pressed }) => [
                  s.primaryButton,
                  { opacity: working !== null || pressed ? 0.7 : 1 },
                ]}>
                {working === "save" ? (
                  <ActivityIndicator color={p.onPrimary} />
                ) : (
                  <Text style={s.primaryButtonText}>↓ Guardar imagen</Text>
                )}
              </Pressable>

              <Pressable
                onPress={handleShare}
                disabled={working !== null}
                style={({ pressed }) => [
                  s.secondaryButton,
                  { opacity: working !== null || pressed ? 0.7 : 1 },
                ]}>
                {working === "share" ? (
                  <ActivityIndicator color={p.primary} />
                ) : (
                  <Text style={s.secondaryButtonText}>Compartir</Text>
                )}
              </Pressable>
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
