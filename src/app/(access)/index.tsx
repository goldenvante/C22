import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import { useAuth } from "@/auth/AuthProvider";
import { C22 } from "@/constants/theme";
import { listEvents } from "@/features/events/api";
import { eventStyles as s } from "@/features/events/eventStyles";
import { formatFecha, formatHora, type EventItem } from "@/features/events/types";

export default function AccessHome() {
  const { profile, loading: authLoading, signOut } = useAuth();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [eventId, setEventId] = useState("");

  const load = useCallback(async () => {
    try {
      setError(null);
      // RLS limita a eventos visibles (publicados/finalizados). Sin duplicar filtros.
      setEvents(await listEvents());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const selected = events.find((ev) => ev.id === eventId) ?? null;

  if (authLoading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={C22.wine} />
      </View>
    );
  }

  return (
    <View style={s.screen}>
      <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
        <View style={[s.scroll, { flex: 1 }]}>
          <Text style={s.screenTitle}>Control de acceso</Text>
          <View style={s.goldRule} />
          <Text style={s.meta}>Hola, {profile?.nombre ?? profile?.usuario}.</Text>

          <Text style={s.sectionTitle}>Selecciona el evento</Text>

          {loading ? (
            <ActivityIndicator color={C22.wine} />
          ) : (
            <FlatList
              data={events}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ gap: 12, paddingBottom: 8 }}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
              ListEmptyComponent={
                <Text style={s.meta}>{error ?? "No hay eventos disponibles."}</Text>
              }
              renderItem={({ item }) => {
                const isSelected = item.id === eventId;
                return (
                  <Pressable
                    onPress={() => setEventId(item.id)}
                    style={({ pressed }) => [
                      s.secondaryButton,
                      isSelected && { backgroundColor: C22.wine, borderColor: C22.wine },
                      { opacity: pressed ? 0.7 : 1 },
                    ]}>
                    <Text style={[s.secondaryButtonText, isSelected && { color: C22.cream }]}>
                      {item.nombre} · {formatFecha(item.fecha)} {formatHora(item.hora)}
                    </Text>
                  </Pressable>
                );
              }}
            />
          )}

          {selected ? (
            <Text style={s.smallBold}>Evento: {selected.nombre}</Text>
          ) : null}

          <Pressable
            disabled={!selected}
            onPress={() =>
              selected &&
              router.push({ pathname: "/(access)/escanear", params: { eventId: selected.id } })
            }
            style={({ pressed }) => [s.primaryButton, { opacity: !selected || pressed ? 0.5 : 1 }]}>
            <Text style={s.primaryButtonText}>Escanear boleto</Text>
          </Pressable>

          <Pressable
            disabled={!selected}
            onPress={() =>
              selected &&
              router.push({ pathname: "/(access)/lista", params: { eventId: selected.id } })
            }
            style={({ pressed }) => [s.secondaryButton, { opacity: !selected || pressed ? 0.5 : 1 }]}>
            <Text style={s.secondaryButtonText}>Lista de puerta</Text>
          </Pressable>

          <Pressable
            onPress={() => router.push("/(access)/historial")}
            style={({ pressed }) => [s.secondaryButton, { opacity: pressed ? 0.7 : 1 }]}>
            <Text style={s.secondaryButtonText}>Historial</Text>
          </Pressable>

          <Pressable onPress={() => signOut()} style={s.linkWrap}>
            <Text style={s.link}>Cerrar sesión</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}
