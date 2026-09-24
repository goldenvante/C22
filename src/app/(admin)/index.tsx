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
import { ThemeSelector } from "@/branding/ThemeSelector";
import { listEvents } from "@/features/events/api";
import { useEventStyles } from "@/features/events/eventStyles";
import {
  ESTADO_LABEL,
  formatFecha,
  formatHora,
  type EventItem,
} from "@/features/events/types";

export default function AdminEvents() {
  const { s, p, badge } = useEventStyles();
  const { profile, signOut } = useAuth();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
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

  function openEvent(id: string) {
    router.push({ pathname: "/(admin)/events/[id]", params: { id } });
  }

  return (
    <View style={s.screen}>
      <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
        <View style={[s.scroll, { flex: 1 }]}>
          <Text style={s.screenTitle}>Eventos</Text>
          <View style={s.goldRule} />
          <Text style={s.meta}>Hola, {profile?.nombre ?? profile?.usuario}.</Text>

          {loading ? (
            <ActivityIndicator color={p.primary} />
          ) : (
            <FlatList
              data={events}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ gap: 12, paddingBottom: 24 }}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
              ListEmptyComponent={
                <Text style={s.meta}>{error ?? "Aún no hay eventos. Crea el primero."}</Text>
              }
              renderItem={({ item }) => {
                const b = badge(item.estado);
                return (
                  <Pressable onPress={() => openEvent(item.id)}>
                    <View style={s.card}>
                      <View style={s.row}>
                        <Text style={[s.sectionTitle, { flex: 1 }]}>{item.nombre}</Text>
                        <Text style={s.smallBold}>{item.codigo}</Text>
                      </View>
                      <Text style={s.meta}>
                        {formatFecha(item.fecha)} · {formatHora(item.hora)} · {item.lugar ?? "Lugar por definir"}
                      </Text>
                      <View style={b.pill}>
                        <Text style={b.text}>{ESTADO_LABEL[item.estado]}</Text>
                      </View>
                    </View>
                  </Pressable>
                );
              }}
            />
          )}

          <Pressable
            onPress={() => router.push("/(admin)/events/new")}
            style={({ pressed }) => [s.primaryButton, { opacity: pressed ? 0.7 : 1 }]}>
            <Text style={s.primaryButtonText}>+ Nuevo evento</Text>
          </Pressable>

          <Pressable
            onPress={() => router.push("/(admin)/usuarios")}
            style={({ pressed }) => [s.secondaryButton, { opacity: pressed ? 0.7 : 1 }]}>
            <Text style={s.secondaryButtonText}>Usuarios</Text>
          </Pressable>

          <Pressable
            onPress={() => router.push("/(admin)/ventas")}
            style={({ pressed }) => [s.secondaryButton, { opacity: pressed ? 0.7 : 1 }]}>
            <Text style={s.secondaryButtonText}>Ventas</Text>
          </Pressable>

          <Pressable
            onPress={() => router.push("/(admin)/cortesias")}
            style={({ pressed }) => [s.secondaryButton, { opacity: pressed ? 0.7 : 1 }]}>
            <Text style={s.secondaryButtonText}>Cortesías</Text>
          </Pressable>

          <Pressable
            onPress={() => router.push("/(admin)/reporte")}
            style={({ pressed }) => [s.secondaryButton, { opacity: pressed ? 0.7 : 1 }]}>
            <Text style={s.secondaryButtonText}>Reporte de ventas</Text>
          </Pressable>

          <Pressable
            onPress={() => router.push("/(admin)/ahorro")}
            style={({ pressed }) => [s.secondaryButton, { opacity: pressed ? 0.7 : 1 }]}>
            <Text style={s.secondaryButtonText}>Ahorro</Text>
          </Pressable>

          <ThemeSelector />

          <Pressable onPress={() => signOut()} style={s.linkWrap}>
            <Text style={s.link}>Cerrar sesión</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}
