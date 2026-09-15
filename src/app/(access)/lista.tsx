import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams } from "expo-router";

import { BackHeader } from "@/components/back-header";
import { C22 } from "@/constants/theme";
import { getEvent } from "@/features/events/api";
import { eventStyles as s } from "@/features/events/eventStyles";
import {
  listGuestlist,
  validateEntryById,
  type GuestTicket,
  type ValidateResult,
} from "@/features/access/api";
import { ResultCard } from "@/features/access/ResultCard";
import { formatFolio, ticketBadge, TICKET_ESTADO_LABEL } from "@/features/sales/types";

export default function ListaPuertaScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const [eventName, setEventName] = useState<string | null>(null);
  const [tickets, setTickets] = useState<GuestTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<GuestTicket | null>(null);
  const [result, setResult] = useState<ValidateResult | null>(null);
  const [busy, setBusy] = useState(false);
  // Ref anti-doble: evita registrar la misma entrada dos veces con doble-tap.
  const processing = useRef(false);

  const load = useCallback(async () => {
    if (!eventId) {
      setLoading(false);
      return;
    }
    try {
      setError(null);
      setTickets(await listGuestlist(eventId));
      const ev = await getEvent(eventId).catch(() => null);
      setEventName(ev?.nombre ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [eventId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tickets;
    return tickets.filter(
      (t) =>
        t.comprador.toLowerCase().includes(q) ||
        String(t.folio).includes(q) ||
        formatFolio(t.folio).toLowerCase().includes(q),
    );
  }, [tickets, query]);

  function pick(ticket: GuestTicket) {
    setSelected(ticket);
    setResult(null);
  }

  async function handleRegister() {
    if (processing.current || busy || !selected || !eventId) return;
    processing.current = true;
    setBusy(true);
    try {
      setResult(await validateEntryById(selected.ticketId, eventId));
      // Refresca estados en segundo plano (el boleto registrado cambia a UTILIZADO).
      listGuestlist(eventId)
        .then(setTickets)
        .catch(() => {});
    } catch (e) {
      setResult(null);
      setError((e as Error).message);
    } finally {
      setBusy(false);
      processing.current = false;
    }
  }

  function handleNext() {
    setSelected(null);
    setResult(null);
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

  return (
    <View style={s.screen}>
      <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
        <View style={[s.scroll, { flex: 1 }]}>
          <Text style={s.screenTitle}>Lista de puerta</Text>
          <View style={s.goldRule} />
          <BackHeader fallback="/(access)" />
          <Text style={s.meta}>
            {eventName ? `Evento: ${eventName}` : "Busca por nombre o folio, coteja INE y registra."}
          </Text>

          <TextInput
            value={query}
            onChangeText={(v) => setQuery(v)}
            placeholder="Buscar por nombre o folio…"
            style={s.input}
          />

          {selected && !result ? (
            <View style={s.card}>
              <Text style={[s.smallBold, { fontSize: 24 }]}>{selected.comprador}</Text>
              <Text style={[s.screenTitle, { fontSize: 30 }]}>{formatFolio(selected.folio)}</Text>
              <Text style={s.meta}>
                {selected.fase ?? "Sin fase"}
                {selected.esCortesia ? " · Cortesía" : ""} ·{" "}
                {TICKET_ESTADO_LABEL[selected.estado]}
              </Text>
              <Text style={s.meta}>Coteja la identificación antes de registrar.</Text>
              <Pressable
                onPress={handleRegister}
                disabled={busy || selected.estado !== "ACTIVO"}
                style={({ pressed }) => [
                  s.primaryButton,
                  { opacity: busy || pressed || selected.estado !== "ACTIVO" ? 0.5 : 1 },
                ]}>
                <Text style={s.primaryButtonText}>
                  {busy ? "Registrando…" : "Registrar entrada"}
                </Text>
              </Pressable>
              {selected.estado !== "ACTIVO" ? (
                <Text style={s.error}>Este boleto no está activo y no permite entrada.</Text>
              ) : null}
              <Pressable onPress={handleNext} style={s.linkWrap}>
                <Text style={s.link}>Elegir otro boleto</Text>
              </Pressable>
            </View>
          ) : null}

          {result ? (
            <View style={{ gap: 8 }}>
              <ResultCard result={result} eventName={eventName} />
              <Pressable
                onPress={handleNext}
                style={({ pressed }) => [s.primaryButton, { opacity: pressed ? 0.7 : 1 }]}>
                <Text style={s.primaryButtonText}>Siguiente</Text>
              </Pressable>
            </View>
          ) : null}

          {loading ? (
            <ActivityIndicator color={C22.wine} />
          ) : error && tickets.length === 0 ? (
            <View style={{ gap: 8 }}>
              <Text style={s.error}>{error}</Text>
              <Pressable
                onPress={() => {
                  setLoading(true);
                  load();
                }}
                style={({ pressed }) => [s.secondaryButton, { opacity: pressed ? 0.7 : 1 }]}>
                <Text style={s.secondaryButtonText}>Reintentar</Text>
              </Pressable>
            </View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.ticketId}
              contentContainerStyle={{ gap: 12, paddingBottom: 24 }}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={() => {
                    setRefreshing(true);
                    load();
                  }}
                />
              }
              ListEmptyComponent={
                <Text style={s.meta}>
                  {tickets.length === 0 ? "Sin boletos para este evento." : "Sin resultados para esa búsqueda."}
                </Text>
              }
              renderItem={({ item }) => {
                const badge = ticketBadge(item.estado);
                const isSelected = selected?.ticketId === item.ticketId && !result;
                return (
                  <Pressable
                    onPress={() => pick(item)}
                    style={({ pressed }) => [
                      s.card,
                      isSelected && { borderColor: C22.wine, borderWidth: 2 },
                      { opacity: pressed ? 0.7 : 1 },
                    ]}>
                    <View style={s.row}>
                      <Text style={[s.smallBold, { flex: 1 }]}>{formatFolio(item.folio)}</Text>
                      <View style={badge.pill}>
                        <Text style={badge.text}>{TICKET_ESTADO_LABEL[item.estado]}</Text>
                      </View>
                    </View>
                    <Text style={s.body}>{item.comprador}</Text>
                    <Text style={s.meta}>
                      {item.fase ?? "Sin fase"}
                      {item.esCortesia ? " · Cortesía" : ""}
                    </Text>
                  </Pressable>
                );
              }}
            />
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}
