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

import { BackHeader } from "@/components/back-header";
import { C22 } from "@/constants/theme";
import { eventStyles as s } from "@/features/events/eventStyles";
import { formatPrecio } from "@/features/events/types";
import { mySales } from "@/features/sales/api";
import {
  formatFolio,
  METODO_LABEL,
  ticketBadge,
  TICKET_ESTADO_LABEL,
  type SaleTicket,
} from "@/features/sales/types";

function formatFechaCorta(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export default function MisVentasScreen() {
  const [sales, setSales] = useState<SaleTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setSales(await mySales());
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
          <Text style={s.screenTitle}>Mis ventas</Text>
          <View style={s.goldRule} />
          <BackHeader fallback="/(seller)" />

          {loading ? (
            <ActivityIndicator color={C22.wine} />
          ) : (
            <FlatList
              data={sales}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ gap: 12, paddingBottom: 24 }}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
              ListEmptyComponent={
                <Text style={s.meta}>{error ?? "Aún no tienes ventas registradas."}</Text>
              }
              renderItem={({ item }) => {
                const badge = ticketBadge(item.estado);
                return (
                  <Pressable
                    onPress={() =>
                      router.push({ pathname: "/(seller)/ventas/[id]", params: { id: item.id } })
                    }>
                    <View style={s.card}>
                      <View style={s.row}>
                        <Text style={[s.smallBold, { flex: 1 }]}>{formatFolio(item.folio)}</Text>
                        <View style={badge.pill}>
                          <Text style={badge.text}>{TICKET_ESTADO_LABEL[item.estado]}</Text>
                        </View>
                      </View>
                      <Text style={s.body}>{item.comprador_nombre}</Text>
                      {item.es_cortesia ? (
                        <Text style={[s.smallBold, { color: C22.wine }]}>CORTESÍA</Text>
                      ) : null}
                      <Text style={s.meta}>
                        {item.evento?.nombre ?? "Evento no disponible"} · {item.fase?.nombre ?? ""}
                      </Text>
                      <Text style={s.meta}>
                        {formatPrecio(item.precio_pagado)} · {METODO_LABEL[item.metodo_pago]} ·{" "}
                        {formatFechaCorta(item.created_at)}
                      </Text>
                    </View>
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
