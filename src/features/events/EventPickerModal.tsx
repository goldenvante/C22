import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { listEvents } from "./api";
import { useEventStyles } from "./eventStyles";
import { formatFecha, formatHora, type EventItem } from "./types";

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Recibe el id del evento elegido y cierra el modal. */
  onSelect: (eventId: string) => void;
  title?: string;
};

/**
 * Selector de evento en modal (hoja inferior). Existe porque las rutas
 * /escanear y /lista exigen `eventId` y la app no guarda un "evento activo":
 * el usuario lo elige en cada entrada. Compartido por el inicio de acceso y
 * por el inicio de seller cuando ese usuario tiene también el rol access.
 */
export function EventPickerModal({ visible, onClose, onSelect, title }: Props) {
  const { s, p } = useEventStyles();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    load();
  }, [visible, load]);

  function choose(eventId: string) {
    onClose();
    onSelect(eventId);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.modalOverlay}>
        <Pressable
          style={{ flex: 1 }}
          onPress={onClose}
          accessibilityLabel="Cerrar"
        />
        <SafeAreaView
          edges={["bottom"]}
          style={{
            backgroundColor: p.surface,
            borderTopWidth: 1,
            borderColor: p.border,
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
          }}>
          <View style={{ padding: 16, gap: 8 }}>
            <Text style={s.sectionTitle}>{title ?? "Selecciona el evento"}</Text>
            <View style={s.goldRule} />
            {loading ? (
              <View style={{ paddingVertical: 24, alignItems: "center" }}>
                <ActivityIndicator color={p.primary} />
              </View>
            ) : (
              <ScrollView
                style={{ maxHeight: 360 }}
                contentContainerStyle={{
                  gap: 8,
                  paddingBottom: 16,
                  paddingTop: 8,
                }}
                refreshControl={
                  <RefreshControl
                    refreshing={refreshing}
                    onRefresh={() => {
                      setRefreshing(true);
                      load();
                    }}
                  />
                }>
                {error ? <Text style={s.error}>{error}</Text> : null}
                {!error && events.length === 0 ? (
                  <Text style={s.meta}>No hay eventos disponibles.</Text>
                ) : null}
                {events.map((ev) => (
                  <Pressable
                    key={ev.id}
                    onPress={() => choose(ev.id)}
                    style={({ pressed }) => [
                      s.secondaryButton,
                      { opacity: pressed ? 0.7 : 1 },
                    ]}>
                    <Text style={s.secondaryButtonText}>
                      {ev.nombre} · {formatFecha(ev.fecha)} {formatHora(ev.hora)}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}
