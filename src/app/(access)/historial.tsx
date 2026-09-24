import { router, useFocusEffect } from "expo-router";
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

import { BackHeader } from "@/components/back-header";
import { myScans, type ScanRecord } from "@/features/access/api";
import { formatFechaHora, RESULTADO_LABEL } from "@/features/access/display";
import { useEventStyles } from "@/features/events/eventStyles";

export default function HistorialScreen() {
  const { s, p } = useEventStyles();
  const [scans, setScans] = useState<ScanRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setScans(await myScans());
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
          <Text style={s.screenTitle}>Historial de accesos</Text>
          <View style={s.goldRule} />
          <BackHeader fallback="/(access)" />

          {loading ? (
            <ActivityIndicator color={p.primary} />
          ) : error ? (
            <View style={{ gap: 8 }}>
              <Text style={s.error}>{error}</Text>
              <Pressable
                onPress={() => {
                  setLoading(true);
                  load();
                }}
                style={({ pressed }) => [
                  s.secondaryButton,
                  { opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Text style={s.secondaryButtonText}>Reintentar</Text>
              </Pressable>
            </View>
          ) : (
            <FlatList
              data={scans}
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
                <Text style={s.meta}>Aún no has registrado accesos.</Text>
              }
              renderItem={({ item }) => (
                <Pressable
                  onPress={() =>
                    router.push({
                      pathname: "/(access)/historial/[id]",
                      params: { id: item.id },
                    })
                  }
                  style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                >
                  <View style={s.card}>
                    <View style={s.row}>
                      <Text style={[s.smallBold, { flex: 1 }]}>
                        {RESULTADO_LABEL[item.resultado]}
                      </Text>
                      <Text style={s.meta}>
                        {formatFechaHora(item.scannedAt)}
                      </Text>
                    </View>
                    <Text style={s.meta}>
                      {item.evento?.nombre ?? "Evento no disponible"}
                    </Text>
                    <Text style={[s.link, { textAlign: "right" }]}>›</Text>
                  </View>
                </Pressable>
              )}
            />
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}
