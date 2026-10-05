import { useCallback, useState } from "react";
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
import { useFocusEffect } from "expo-router";

import { BackHeader } from "@/components/back-header";
import { useEventStyles } from "@/features/events/eventStyles";
import { listEvents } from "@/features/events/api";
import type { EventItem } from "@/features/events/types";
import {
  listQuotas,
  setQuota,
  type CourtesyQuota,
} from "@/features/sales/api";
import { listStaff } from "@/features/users/api";
import type { Profile } from "@/lib/supabase";

export default function CortesiasScreen() {
  const { s, p } = useEventStyles();
  const [sellers, setSellers] = useState<Profile[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [quotas, setQuotas] = useState<CourtesyQuota[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sellerId, setSellerId] = useState("");
  const [eventId, setEventId] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    // Cargas independientes: si falla la lista de cupos (p. ej. migración
    // 08 aún no aplicada), los selectores de vendedor/evento siguen activos.
    try {
      const st = await listStaff();
      setSellers(st.filter((p) => p.activo !== false));
    } catch (e) {
      setError(`Vendedores: ${(e as Error).message}`);
    }
    try {
      setEvents(await listEvents());
    } catch (e) {
      setError((prev) =>
        prev ? `${prev} | Eventos: ${(e as Error).message}` : `Eventos: ${(e as Error).message}`,
      );
    }
    try {
      setQuotas(await listQuotas());
    } catch (e) {
      setError((prev) =>
        prev
          ? `${prev} | Cupos: ${(e as Error).message}`
          : `Cupos: ${(e as Error).message} (¿aplicaste la migración 08?)`,
      );
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function handleSave() {
    const n = Number(cantidad);
    if (!sellerId || !eventId) {
      setError("Elige usuario y evento.");
      return;
    }
    if (!Number.isInteger(n) || n < 0) {
      setError("La cantidad debe ser un entero mayor o igual a 0, sin límite superior.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await setQuota(sellerId, eventId, n);
      setCantidad("");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={s.screen}>
      <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
        <View style={[s.scroll, { flex: 1 }]}>
          <Text style={s.screenTitle}>Cortesías</Text>
          <View style={s.goldRule} />
          <BackHeader fallback="/(admin)" />
          <Text style={s.meta}>
            Asigna boletos gratis por usuario y evento, sin límite. El usuario no
            puede exceder lo asignado.
          </Text>

          {loading ? (
            <View style={s.center}>
              <ActivityIndicator color={p.primary} />
            </View>
          ) : (
            <FlatList
              data={quotas}
              keyExtractor={(item) => `${item.eventId}:${item.sellerId}`}
              contentContainerStyle={{ gap: 12, paddingBottom: 24 }}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
              ListHeaderComponent={
                <View style={s.card}>
                  <Text style={s.sectionTitle}>Asignar cortesías</Text>
                  <Text style={s.label}>Usuario</Text>
                  {sellers.length === 0 ? (
                    <Text style={s.meta}>Sin usuarios cargados.</Text>
                  ) : null}
                  <View style={{ gap: 8 }}>
                    {sellers.map((seller) => {
                      const selected = seller.id === sellerId;
                      return (
                        <Pressable
                          key={seller.id}
                          disabled={busy}
                          onPress={() => setSellerId(seller.id)}
                          style={({ pressed }) => [
                            s.secondaryButton,
                            selected && { backgroundColor: p.primary, borderColor: p.primary },
                            { opacity: pressed || busy ? 0.7 : 1 },
                          ]}>
                          <Text style={[s.secondaryButtonText, selected && { color: p.onPrimary }]}>
                            {seller.nombre} · @{seller.usuario}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <Text style={s.label}>Evento</Text>
                  {events.length === 0 ? (
                    <Text style={s.meta}>Sin eventos cargados.</Text>
                  ) : null}
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
                  <Text style={s.label}>Cantidad asignada</Text>
                  <TextInput
                    value={cantidad}
                    onChangeText={setCantidad}
                    placeholder="5"
                    placeholderTextColor={p.textSoft}
                    keyboardType="number-pad"
                    editable={!busy}
                    style={s.input}
                  />
                  {error ? <Text style={s.error}>{error}</Text> : null}
                  <Pressable
                    onPress={handleSave}
                    disabled={busy}
                    style={({ pressed }) => [s.primaryButton, { opacity: busy || pressed ? 0.7 : 1 }]}>
                    {busy ? (
                      <ActivityIndicator color={p.onPrimary} />
                    ) : (
                      <Text style={s.primaryButtonText}>Guardar asignación</Text>
                    )}
                  </Pressable>
                </View>
              }
              ListEmptyComponent={
                !error ? <Text style={s.meta}>Aún no hay cortesías asignadas.</Text> : null
              }
              renderItem={({ item }) => (
                <View style={s.card}>
                  <Text style={s.smallBold}>
                    {item.vendedor?.nombre ?? "—"} · {item.evento?.nombre ?? "Evento no disponible"}
                  </Text>
                  <Text style={s.meta}>
                    Asignadas: {item.asignadas} · Usadas: {item.usadas} · Disponibles:{" "}
                    {Math.max(0, item.asignadas - item.usadas)}
                  </Text>
                </View>
              )}
            />
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}
