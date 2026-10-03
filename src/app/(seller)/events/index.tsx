import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";

import { BackHeader } from "@/components/back-header";
import { listEvents } from "@/features/events/api";
import { useEventStyles } from "@/features/events/eventStyles";
import {
  ESTADO_LABEL,
  formatFecha,
  formatHora,
  type EventEstado,
  type EventItem,
} from "@/features/events/types";

/** El vendedor solo ve lo que le concierne: eventos activos y finalizados. */
const VISIBLES: EventEstado[] = ["publicado", "finalizado"];

/**
 * Eventos (vendedor): lista de solo lectura con los eventos activos
 * (publicados) y finalizados. Sin borradores ni cancelados y sin alta de
 * eventos: crear/editar eventos es exclusivo del admin en /(admin)/events.
 */
export default function SellerEvents() {
  const { s, p, badge } = useEventStyles();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const all = await listEvents();
      setEvents(all.filter((ev) => VISIBLES.includes(ev.estado)));
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

  return (
    <View style={s.screen}>
      <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
        <View style={[s.scroll, { flex: 1 }]}>
          <Text style={s.screenTitle}>Eventos</Text>
          <View style={s.goldRule} />
          <BackHeader fallback="/(seller)" />
          <Text style={s.meta}>Eventos activos y finalizados.</Text>

          {loading ? (
            <View style={s.center}>
              <ActivityIndicator color={p.primary} />
            </View>
          ) : (
            <FlatList
              data={events}
              keyExtractor={(item) => item.id}
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
                <Text style={error ? s.error : s.meta}>
                  {error ?? "No hay eventos activos ni finalizados."}
                </Text>
              }
              renderItem={({ item }) => {
                const b = badge(item.estado);
                return (
                  <View
                    accessibilityRole="summary"
                    accessibilityLabel={`${item.nombre}. ${ESTADO_LABEL[item.estado]}`}
                    style={s.card}>
                    <View style={s.row}>
                      <Text style={[s.sectionTitle, { flex: 1 }]}>{item.nombre}</Text>
                      <Text style={s.smallBold}>{item.codigo}</Text>
                    </View>
                    <Text style={s.meta}>
                      {formatFecha(item.fecha)} · {formatHora(item.hora)} ·{" "}
                      {item.lugar ?? "Lugar por definir"}
                    </Text>
                    <View style={b.pill}>
                      <Text style={b.text}>{ESTADO_LABEL[item.estado]}</Text>
                    </View>
                  </View>
                );
              }}

            />
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}
