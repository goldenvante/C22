import { useCallback, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams } from "expo-router";

import { BackHeader } from "@/components/back-header";
import { useEventStyles } from "@/features/events/eventStyles";
import {
  getEntryTicket,
  getScanEntry,
  type EntryTicketBundle,
  type ScanRecord,
} from "@/features/access/api";
import { formatFechaHora, RESULTADO_LABEL } from "@/features/access/display";
import { BoletoCard, type BoletoData } from "@/features/sales/BoletoCard";

export default function AccesoDetalleScreen() {
  const { s, p } = useEventStyles();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [scan, setScan] = useState<ScanRecord | null>(null);
  const [bundle, setBundle] = useState<EntryTicketBundle | null>(null);
  const [noTicket, setNoTicket] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) {
      setError("Acceso no válido.");
      setLoading(false);
      return;
    }
    try {
      setError(null);
      const found = await getScanEntry(id);
      if (!found) {
        setError("El acceso no existe.");
        setLoading(false);
        return;
      }
      setScan(found);
      // Boleto vía RPC (sin SELECT directo sobre tickets).
      const res = await getEntryTicket(id);
      if (res.ok) {
        setBundle(res.bundle);
      } else if (res.code === "SIN_BOLETO") {
        setNoTicket(true);
      } else if (res.code === "NO_AUTORIZADO") {
        setError("Tu sesión no tiene permiso. Inicia sesión de nuevo.");
      } else {
        setError("El acceso ya no está disponible.");
      }
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

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={p.primary} />
      </View>
    );
  }

  const boleto: BoletoData | null = bundle
    ? {
        id: bundle.ticket.id,
        folio: bundle.ticket.folio,
        comprador_nombre: bundle.ticket.comprador,
        estado: bundle.ticket.estado,
        es_cortesia: bundle.ticket.esCortesia,
        qr_token: bundle.ticket.qrToken,
        evento: bundle.evento
          ? {
              nombre: bundle.evento.nombre,
              fecha: bundle.evento.fecha,
              hora: bundle.evento.hora,
              lugar: bundle.evento.lugar,
              imagen_url: bundle.evento.imagenUrl,
              mapas_url: null,
            }
          : null,
      }
    : null;

  return (
    <View style={s.screen}>
      <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
        <ScrollView contentContainerStyle={s.scroll}>
          <Text style={s.screenTitle}>Detalle del acceso</Text>
          <View style={s.goldRule} />
          <BackHeader fallback="/(access)/historial" />
          {error && !scan ? (
            <Text style={s.error}>{error}</Text>
          ) : scan ? (
            <>
              <View style={s.card}>
                <View style={s.row}>
                  <Text style={[s.smallBold, { flex: 1 }]}>
                    {RESULTADO_LABEL[scan.resultado]}
                  </Text>
                  <Text style={s.meta}>{formatFechaHora(scan.scannedAt)}</Text>
                </View>
                <Text style={s.meta}>{scan.evento?.nombre ?? "Evento no disponible"}</Text>
                {bundle?.fase ? <Text style={s.meta}>Etapa: {bundle.fase}</Text> : null}
              </View>
              {boleto ? <BoletoCard sale={boleto} /> : null}
              {noTicket ? (
                <Text style={s.meta}>
                  Este intento no tiene boleto asociado (código inexistente).
                </Text>
              ) : null}
              {error ? <Text style={s.error}>{error}</Text> : null}
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
