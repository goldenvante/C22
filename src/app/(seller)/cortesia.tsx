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

import { useAuth } from "@/auth/AuthProvider";
import { BackHeader } from "@/components/back-header";
import { useEventStyles } from "@/features/events/eventStyles";
import { formatPrecio, type EventItem } from "@/features/events/types";
import {
  createCourtesy,
  getMyQuota,
  listSellableEvents,
} from "@/features/sales/api";
import { formatFolio, type SaleTicket } from "@/features/sales/types";
import { hasRole } from "@/lib/supabase";

export default function CortesiaScreen() {
  const { s, p } = useEventStyles();
  const { profile } = useAuth();
  const isAdmin = hasRole(profile, "admin");
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
  // La RPC create_courtesy_ticket no descuenta cupo al admin: sin esta
  // excepción el botón quedaría muerto (el admin no tiene fila de cupo).
  const sinCupo = !isAdmin && disponibles <= 0;

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
              <Text style={s.folio}>{formatFolio(created.folio, created.evento?.codigo ?? "")}</Text>
              <Text style={s.body}>{created.comprador_nombre}</Text>
              <Text style={[s.smallBold, { color: p.primary }]}>CORTESÍA · $0.00</Text>
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
                style={({ pressed }) => [s.linkWrap, { opacity: pressed ? 0.7 : 1 }]}>
                <Text style={s.link}>Generar otra cortesía</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Text style={s.label}>Evento</Text>
              {loadingEvents ? (
                <ActivityIndicator color={p.primary} />
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
                          selected && { backgroundColor: p.primary, borderColor: p.primary },
                          { opacity: pressed || busy ? 0.7 : 1 },
                        ]}>
                        <Text style={[s.secondaryButtonText, selected && { color: p.onPrimary }]}>
                          {ev.nombre} · {ev.codigo}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}

              {eventId && quota ? (
                <Text style={s.meta}>
                  {isAdmin
                    ? "Cortesías sin límite (administrador)."
                    : `Cortesías disponibles: ${disponibles} de ${quota.asignadas}`}
                </Text>
              ) : null}

              <Text style={s.label}>Nombre del comprador</Text>
              <TextInput
                value={nombre}
                onChangeText={setNombre}
                placeholder="Nombre completo"
                placeholderTextColor={p.textSoft}
                editable={!busy}
                style={s.input}
              />

              <Text style={s.label}>Teléfono (opcional)</Text>
              <TextInput
                value={telefono}
                onChangeText={setTelefono}
                placeholder="55 1234 5678"
                placeholderTextColor={p.textSoft}
                keyboardType="phone-pad"
                editable={!busy}
                style={s.input}
              />

              <Text style={s.meta}>Precio: {formatPrecio(0)} · Boleto gratis.</Text>

              {error ? <Text style={s.error}>{error}</Text> : null}

              <Pressable
                onPress={handleSubmit}
                disabled={busy || !eventId || sinCupo}
                style={({ pressed }) => [
                  s.primaryButton,
                  { opacity: busy || !eventId || sinCupo || pressed ? 0.5 : 1 },
                ]}>
                {busy ? (
                  <ActivityIndicator color={p.onPrimary} />
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
