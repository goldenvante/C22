import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";

import { BackHeader } from "@/components/back-header";
import { changeEventEstado, getEvent } from "@/features/events/api";
import { useEventStyles } from "@/features/events/eventStyles";
import { PhaseManager } from "@/features/events/PhaseManager";
import { exportCierrePdf, loadEventTickets } from "@/features/reports/pdfExport";
import { formatMoney, postEventSavings } from "@/features/savings/api";
import {
  ESTADO_LABEL,
  formatFecha,
  formatHora,
  NEXT_ESTADOS,
  type EventEstado,
  type EventItem,
} from "@/features/events/types";

const ESTADO_ACTION_LABEL: Record<EventEstado, string> = {
  borrador: "Borrador",
  publicado: "Publicar",
  finalizado: "Finalizar",
  cancelado: "Cancelar",
};

export default function EventDetailScreen() {
  const { s, p, badge } = useEventStyles();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [event, setEvent] = useState<EventItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyCierre, setBusyCierre] = useState(false);
  const [cierreError, setCierreError] = useState<string | null>(null);
  const [busyMeta, setBusyMeta] = useState(false);
  const [metaMsg, setMetaMsg] = useState<string | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) {
      setError("Evento no válido.");
      setLoading(false);
      return;
    }
    try {
      setError(null);
      const found = await getEvent(id);
      if (!found) setError("El evento no existe.");
      setEvent(found);
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

  function confirmEstado(next: EventEstado) {    if (!event) return;
    Alert.alert(
      `${ESTADO_ACTION_LABEL[next]} evento`,
      `¿${ESTADO_ACTION_LABEL[next]} "${event.nombre}"?`,
      [
        { text: "Volver", style: "cancel" },
        {
          text: "Confirmar",
          style: next === "cancelado" ? "destructive" : "default",
          onPress: async () => {
            setBusy(true);
            setError(null);
            try {
              setEvent(await changeEventEstado(event.id, next));
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  }

  async function handleCierrePdf() {
    if (!event || busyCierre) return;
    setBusyCierre(true);
    setCierreError(null);
    try {
      const tickets = await loadEventTickets(event.id);
      await exportCierrePdf(event, tickets);
    } catch (e) {
      setCierreError((e as Error).message);
    } finally {
      setBusyCierre(false);
    }
  }

  async function handleEnviarMeta() {
    if (!event || busyMeta) return;
    setBusyMeta(true);
    setMetaError(null);
    setMetaMsg(null);
    try {
      const r = await postEventSavings(event.id);
      setMetaMsg(
        r.monto <= 0
          ? "Este evento no tiene ingresos por enviar."
          : r.yaExistia
            ? `Ya estaba en Meta: ${formatMoney(r.monto)}.`
            : `Enviado a Meta: ${formatMoney(r.monto)}.`,
      );
    } catch (e) {
      setMetaError((e as Error).message);
    } finally {
      setBusyMeta(false);
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
          {error && !event ? (
            <Text style={s.error}>{error}</Text>
          ) : event ? (
            <>
              <Text style={s.screenTitle}>{event.nombre}</Text>
              <View style={s.goldRule} />
              <BackHeader fallback="/(admin)" />

              <View style={s.card}>
                <View style={badge(event.estado).pill}>
                  <Text style={badge(event.estado).text}>{ESTADO_LABEL[event.estado]}</Text>
                </View>
                <Text style={s.body}>Código: {event.codigo}</Text>
                <Text style={s.meta}>
                  {formatFecha(event.fecha)} · {formatHora(event.hora)}
                </Text>
                <Text style={s.meta}>{event.lugar ?? "Lugar por definir"}</Text>
                {event.mapas_url ? (
                  <Text style={s.meta} numberOfLines={1}>
                    Maps: {event.mapas_url}
                  </Text>
                ) : null}
                <Text style={s.meta}>Folios generados: {event.ultimo_folio}</Text>
                <Pressable
                  onPress={() =>
                    router.push({ pathname: "/(admin)/events/[id]/edit", params: { id: event.id } })
                  }
                  style={({ pressed }) => [s.secondaryButton, { opacity: pressed ? 0.7 : 1 }]}>
                  <Text style={s.secondaryButtonText}>Editar datos</Text>
                </Pressable>
                <Pressable
                  onPress={() =>
                    router.push({
                      pathname: "/(admin)/events/[id]/offline",
                      params: { id: event.id },
                    })
                  }
                  style={({ pressed }) => [s.secondaryButton, { opacity: pressed ? 0.7 : 1 }]}>
                  <Text style={s.secondaryButtonText}>Preparar para uso offline</Text>
                </Pressable>
              </View>

              <View style={s.card}>
                <Text style={s.sectionTitle}>Estado</Text>
                {NEXT_ESTADOS[event.estado].length === 0 ? (
                  <Text style={s.meta}>Estado final, sin más cambios.</Text>
                ) : (
                  <View style={s.row}>
                    {NEXT_ESTADOS[event.estado].map((next) =>
                      next === "cancelado" ? (
                        <Pressable
                          key={next}
                          disabled={busy}
                          onPress={() => confirmEstado(next)}
                          style={({ pressed }) => [
                            s.dangerButton,
                            { opacity: busy || pressed ? 0.7 : 1 },
                          ]}>
                          <Text style={s.dangerButtonText}>{ESTADO_ACTION_LABEL[next]}</Text>
                        </Pressable>
                      ) : (
                        <Pressable
                          key={next}
                          disabled={busy}
                          onPress={() => confirmEstado(next)}
                          style={({ pressed }) => [
                            s.secondaryButton,
                            { opacity: busy || pressed ? 0.7 : 1 },
                          ]}>
                          <Text style={s.secondaryButtonText}>{ESTADO_ACTION_LABEL[next]}</Text>
                        </Pressable>
                      ),
                    )}
                  </View>
                )}
                {error ? <Text style={s.error}>{error}</Text> : null}
              </View>

              {event.estado === "finalizado" ? (
                <View style={s.card}>
                  <Text style={s.sectionTitle}>Cierre del evento</Text>
                  <Text style={s.meta}>
                    Genera el PDF del cierre en solo lectura: no se puede editar ni
                    copiar, solo imprimir.
                  </Text>
                  {cierreError ? <Text style={s.error}>{cierreError}</Text> : null}
                  <Pressable
                    disabled={busyCierre}
                    onPress={handleCierrePdf}
                    style={({ pressed }) => [
                      s.primaryButton,
                      { opacity: busyCierre || pressed ? 0.7 : 1 },
                    ]}>
                    {busyCierre ? (
                      <ActivityIndicator color={p.onPrimary} />
                    ) : (
                      <Text style={s.primaryButtonText}>Generar PDF de cierre</Text>
                    )}
                  </Pressable>

                  <Text style={s.sectionTitle}>Meta</Text>
                  <Text style={s.meta}>
                    Envía lo recaudado por este evento a la Meta del comité. Si ya
                    se envió, no se duplica.
                  </Text>
                  {metaMsg ? <Text style={s.smallBold}>{metaMsg}</Text> : null}
                  {metaError ? <Text style={s.error}>{metaError}</Text> : null}
                  <Pressable
                    disabled={busyMeta}
                    onPress={handleEnviarMeta}
                    style={({ pressed }) => [
                      s.secondaryButton,
                      { opacity: busyMeta || pressed ? 0.7 : 1 },
                    ]}>
                    {busyMeta ? (
                      <ActivityIndicator color={p.primary} />
                    ) : (
                      <Text style={s.secondaryButtonText}>Enviar a Meta</Text>
                    )}
                  </Pressable>
                </View>
              ) : null}

              <Text style={s.sectionTitle}>Fases y precios</Text>
              <View style={s.goldRule} />
              <PhaseManager eventId={event.id} />
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
