import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import { BackHeader } from "@/components/back-header";
import { C22 } from "@/constants/theme";
import { eventStyles as s } from "@/features/events/eventStyles";
import { formatPrecio, type EventItem } from "@/features/events/types";
import {
  createCourtesy,
  getMyQuota,
  listSellableEvents,
} from "@/features/sales/api";
import { formatFolio, type SaleTicket } from "@/features/sales/types";

export default function CortesiaScreen() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [eventId, setEventId] = useState("");
  const [quota, setQuota] = useState<{ asignadas: number; usadas: number } | null>(null);
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<SaleTicket | null>(null);

  const loadEvents = useCallback(async () => {
    try {
      setEvents(await listSellableEvents());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingEvents(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadEvents();
    }, [loadEvents]),
  );

  useEffect(() => {
    if (!eventId) {
      setQuota(null);
      return;
    }
    getMyQuota(eventId)
      .then(setQuota)
      .catch(() => setQuota(null));
  }, [eventId]);

  const disponibles = quota ? Math.max(0, quota.asignadas - quota.usadas) : 0;

  async function handleSubmit() {
    if (!eventId || !nombre.trim()) {
      setError("Elige el evento y escribe el nombre del comprador.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const ticket = await createCourtesy(eventId, nombre, telefono);
      setCreated(ticket);
      setNombre("");
      setTelefono("");
      const q = await getMyQuota(eventId).catch(() => null);
      if (q) setQuota(q);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={s.screen}>
      <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
        <ScrollView contentContainerStyle={s.scroll}>
          <Text style={s.screenTitle}>Boletos de cortesía</Text>
          <View style={s.goldRule} />
          <BackHeader fallback="/(seller)" />

          {created ? (
            <View style={s.card}>
              <Text style={s.sectionTitle}>Cortesía generada</Text>
              <Text style={[s.screenTitle, { fontSize: 40 }]}>{formatFolio(created.folio)}</Text>
              <Text style={s.body}>{created.comprador_nombre}</Text>
              <Text style={[s.smallBold, { color: C22.wine }]}>CORTESÍA · $0.00</Text>
              <Pressable
                onPress={() =>
                  router.push({ pathname: "/(seller)/boleto/[id]", params: { id: created.id } })
                }
                style={({ pressed }) => [s.primaryButton, { opacity: pressed ? 0.7 : 1 }]}>
                <Text style={s.primaryButtonText}>Ver boleto digital</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setCreated(null);
                  setError(null);
                }}
                style={s.linkWrap}>
                <Text style={s.link}>Generar otra cortesía</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Text style={s.label}>Evento</Text>
              {loadingEvents ? (
                <ActivityIndicator color={C22.wine} />
              ) : events.length === 0 ? (
                <Text style={s.meta}>No hay eventos publicados por ahora.</Text>
              ) : (
                <View style={{ gap: 8 }}>
                  {events.map((ev) => {
                    const selected = ev.id === eventId;
                    return (
                      <Pressable
                        key={ev.id}
                        disabled={busy}
                        onPress={() => setEventId(ev.id)}
                        style={({ pressed }) => [
                          s.secondaryButton,
                          selected && { backgroundColor: C22.wine, borderColor: C22.wine },
                          { opacity: pressed || busy ? 0.7 : 1 },
                        ]}>
                        <Text style={[s.secondaryButtonText, selected && { color: C22.cream }]}>
                          {ev.nombre} · {ev.codigo}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}

              {eventId && quota ? (
                <Text style={s.meta}>
                  Cortesías disponibles: {disponibles} de {quota.asignadas}
                </Text>
              ) : null}

              <Text style={s.label}>Nombre del comprador</Text>
              <TextInput
                value={nombre}
                onChangeText={setNombre}
                placeholder="Nombre completo"
                placeholderTextColor={C22.inkSoft}
                editable={!busy}
                style={s.input}
              />

              <Text style={s.label}>Teléfono (opcional)</Text>
              <TextInput
                value={telefono}
                onChangeText={setTelefono}
                placeholder="55 1234 5678"
                placeholderTextColor={C22.inkSoft}
                keyboardType="phone-pad"
                editable={!busy}
                style={s.input}
              />

              <Text style={s.meta}>Precio: {formatPrecio(0)} · Boleto gratis.</Text>

              {error ? <Text style={s.error}>{error}</Text> : null}

              <Pressable
                onPress={handleSubmit}
                disabled={busy || !eventId || disponibles <= 0}
                style={({ pressed }) => [
                  s.primaryButton,
                  { opacity: busy || !eventId || disponibles <= 0 || pressed ? 0.5 : 1 },
                ]}>
                {busy ? (
                  <ActivityIndicator color={C22.cream} />
                ) : (
                  <Text style={s.primaryButtonText}>Generar cortesía</Text>
                )}
              </Pressable>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
