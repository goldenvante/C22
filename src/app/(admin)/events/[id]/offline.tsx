import { useCallback, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams } from "expo-router";

import { BackHeader } from "@/components/back-header";
import { getEvent } from "@/features/events/api";
import { useEventStyles } from "@/features/events/eventStyles";
import { ESTADO_LABEL, formatFecha, type EventItem } from "@/features/events/types";
import {
  prepareEventOffline,
  prepareStepLabel,
  readOfflineStatus,
  type OfflineStatus,
  type PrepareProgress,
  type PreparedPackage,
} from "@/offline/prepare";
import { STALE_AFTER_MS } from "@/offline/policy";
import { useSync } from "@/offline/SyncProvider";
import type { SyncReport } from "@/offline/sync";

function formatTs(ms: number): string {
  if (!ms) return "—";
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function reportLabel(report: SyncReport): string {
  if (report.stopped === "offline") return "Sin conexión: se enviará al recuperar la red.";
  if (report.stopped === "no_session") return "Sin sesión: inicia sesión para sincronizar.";
  if (report.stopped === "retry_scheduled") return "No se pudo enviar: pendiente de reintento.";
  if (report.stopped === "rejected") return "El servidor rechazó una operación.";
  if (report.attempted === 0) return "Sin operaciones pendientes.";
  return `Sincronizadas: ${report.synced} · Conflictos: ${report.conflicts}.`;
}

export default function PrepareOfflineScreen() {
  const { s, p, badge } = useEventStyles();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [event, setEvent] = useState<EventItem | null>(null);
  const [status, setStatus] = useState<OfflineStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<PrepareProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<PreparedPackage | null>(null);
  const { summary, syncing, report, error: syncError, refresh, syncNow } = useSync();

  const load = useCallback(async () => {
    if (!id) {
      setError("Evento no válido.");
      setLoading(false);
      return;
    }
    try {
      setError(null);
      const found = await getEvent(id);
      if (!found) {
        setEvent(null);
        setError("El evento no existe.");
      } else {
        setEvent(found);
        setStatus(await readOfflineStatus(found.id));
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
      void refresh();
    }, [load, refresh]),
  );

  async function handlePrepare() {
    if (!event || busy) return;
    setBusy(true);
    setError(null);
    setDone(null);
    setProgress({ step: "evento", downloaded: 0, total: 0 });
    try {
      const pkg = await prepareEventOffline(event.id, setProgress);
      setDone(pkg);
      setStatus(await readOfflineStatus(event.id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  if (Platform.OS === "web") {
    return (
      <View style={s.screen}>
        <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
          <ScrollView contentContainerStyle={s.scroll}>
            <Text style={s.screenTitle}>Paquete offline</Text>
            <View style={s.goldRule} />
            <BackHeader fallback="/(admin)" />
            <Text style={s.meta}>
              El paquete offline y la sincronización sólo están disponibles en la app de Android.
              En la web todo se envía en línea.
            </Text>
          </ScrollView>
        </SafeAreaView>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={p.primary} />
      </View>
    );
  }

  const percent =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.downloaded / progress.total) * 100))
      : 0;
  const staleHours = Math.round(STALE_AFTER_MS / 3_600_000);

  return (
    <View style={s.screen}>
      <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
        <ScrollView contentContainerStyle={s.scroll}>
          <Text style={s.screenTitle}>Uso sin conexión</Text>
          <View style={s.goldRule} />
          <BackHeader fallback="/(admin)" />

          {event ? (
            <>
              <View style={s.card}>
                <View style={badge(event.estado).pill}>
                  <Text style={badge(event.estado).text}>{ESTADO_LABEL[event.estado]}</Text>
                </View>
                <Text style={s.body}>{event.nombre}</Text>
                <Text style={s.meta}>
                  {formatFecha(event.fecha)} · {event.lugar ?? "Lugar por definir"}
                </Text>
              </View>

              <View style={s.card}>
                <Text style={s.sectionTitle}>Paquete sin conexión</Text>
                {status ? (
                  <>
                    <Text style={s.smallBold}>Listo para trabajar sin conexión</Text>
                    <Text style={s.meta}>Boletos descargados: {status.ticketCount}</Text>
                    <Text style={s.meta}>Preparado el: {formatTs(status.preparedAt)}</Text>
                    <Text style={s.meta}>
                      Última sincronización: {formatTs(status.lastSyncAt ?? 0)}
                    </Text>
                    <Text style={s.meta}>Válido hasta: {formatTs(status.expiresAt)}</Text>
                    {status.invalidState ? (
                      <Text style={s.error}>
                        El evento está {ESTADO_LABEL[status.estado].toLowerCase()}: el paquete no
                        puede usarse.
                      </Text>
                    ) : null}
                    {status.expired ? (
                      <Text style={s.error}>
                        El paquete caducó. Conéctate para volver a prepararlo.
                      </Text>
                    ) : null}
                    {!status.expired && status.stale ? (
                      <Text style={s.error}>
                        Sin sincronizar por más de {staleHours} horas.
                      </Text>
                    ) : null}
                  </>
                ) : (
                  <Text style={s.meta}>
                    Sin preparar. Descarga el evento para poder trabajar sin internet.
                  </Text>
                )}
                {done ? (
                  <Text style={s.smallBold}>Paquete listo: {done.totalTickets} boletos.</Text>
                ) : null}
                {error ? <Text style={s.error}>{error}</Text> : null}

                <Pressable
                  disabled={busy}
                  onPress={handlePrepare}
                  style={({ pressed }) => [
                    s.primaryButton,
                    { opacity: busy || pressed ? 0.7 : 1 },
                  ]}>
                  {busy ? (
                    <ActivityIndicator color={p.onPrimary} />
                  ) : (
                    <Text style={s.primaryButtonText}>
                      {error ? "Reintentar" : status ? "Volver a preparar" : "Preparar para uso offline"}
                    </Text>
                  )}
                </Pressable>
              </View>

              <View style={s.card}>
                <Text style={s.sectionTitle}>Sincronización de validaciones</Text>
                <Text style={s.meta}>Pendientes: {summary.pending}</Text>
                <Text style={s.meta}>Sincronizando: {summary.syncing}</Text>
                <Text style={s.meta}>Sincronizadas: {summary.synced}</Text>
                <Text style={s.meta}>Conflictos: {summary.conflict}</Text>
                <Text style={s.meta}>Con error: {summary.failed}</Text>
                <Text style={s.meta}>
                  Última sincronización: {formatTs(summary.lastSyncedAt ?? 0)}
                </Text>
                {report ? <Text style={s.smallBold}>{reportLabel(report)}</Text> : null}
                {syncError ? <Text style={s.error}>{syncError}</Text> : null}
                <Pressable
                  disabled={syncing}
                  onPress={() => void syncNow()}
                  style={({ pressed }) => [
                    s.primaryButton,
                    { opacity: syncing || pressed ? 0.7 : 1 },
                  ]}>
                  {syncing ? (
                    <ActivityIndicator color={p.onPrimary} />
                  ) : (
                    <Text style={s.primaryButtonText}>
                      {summary.pending === 0 ? "Sin pendientes" : "Sincronizar ahora"}
                    </Text>
                  )}
                </Pressable>
              </View>

              {busy && progress ? (
                <View style={s.card}>
                  <Text style={s.sectionTitle}>{prepareStepLabel(progress.step)}</Text>
                  {progress.total > 0 ? (
                    <>
                      <Text style={s.meta}>
                        {progress.downloaded} / {progress.total} boletos
                      </Text>
                      <View
                        style={{
                          height: 8,
                          borderRadius: 4,
                          marginTop: 8,
                          overflow: "hidden",
                          backgroundColor: "rgba(0,0,0,0.12)",
                        }}>
                        <View
                          style={{
                            height: 8,
                            borderRadius: 4,
                            backgroundColor: p.primary,
                            width: `${percent}%` as `${number}%`,
                          }}
                        />
                      </View>
                    </>
                  ) : (
                    <ActivityIndicator color={p.primary} />
                  )}
                </View>
              ) : null}
            </>
          ) : error ? (
            <Text style={s.error}>{error}</Text>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
