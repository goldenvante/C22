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
import { useEventStyles } from "@/features/events/eventStyles";
import { formatPrecio } from "@/features/events/types";
import { allSales } from "@/features/sales/api";
import {
  formatFolio,
  METODO_LABEL,
  ticketBadge,
  TICKET_ESTADO_LABEL,
  type SaleTicket,
  type TicketEstado,
} from "@/features/sales/types";

const FILTROS: ({ value: TicketEstado | "TODOS"; label: string })[] = [
  { value: "TODOS", label: "Todos" },
  { value: "ACTIVO", label: "Activos" },
  { value: "UTILIZADO", label: "Utilizados" },
  { value: "CANCELADO", label: "Cancelados" },
];

export default function AdminVentasScreen() {
  const { s, p } = useEventStyles();
  const [sales, setSales] = useState<SaleTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<TicketEstado | "TODOS">("TODOS");

  const load = useCallback(async () => {
    try {
      setError(null);
      setSales(await allSales());
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

  const visible = filtro === "TODOS" ? sales : sales.filter((t) => t.estado === filtro);

  return (
    <View style={s.screen}>
      <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
        <View style={[s.scroll, { flex: 1 }]}>
          <Text style={s.screenTitle}>Ventas</Text>
          <View style={s.goldRule} />
          <BackHeader fallback="/(admin)" />

          <View style={s.row}>
            {FILTROS.map((f) => {
              const selected = filtro === f.value;
              return (
                <Pressable
                  key={f.value}
                  onPress={() => setFiltro(f.value)}
                  style={({ pressed }) => [
                    s.secondaryButton,
                    selected && { backgroundColor: p.primary, borderColor: p.primary },
                    { opacity: pressed ? 0.7 : 1, paddingHorizontal: 12 },
                  ]}>
                  <Text style={[s.secondaryButtonText, selected && { color: p.onPrimary }]}>
                    {f.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {loading ? (
            <ActivityIndicator color={p.primary} />
          ) : (
            <FlatList
              data={visible}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ gap: 12, paddingBottom: 24 }}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
              ListEmptyComponent={
                <Text style={s.meta}>{error ?? "Aún no hay ventas registradas."}</Text>
              }
              renderItem={({ item }) => {
                const badge = ticketBadge(item.estado);
                return (
                  <Pressable
                    onPress={() =>
                      router.push({ pathname: "/(admin)/ventas/[id]", params: { id: item.id } })
                    }>
                    <View style={s.card}>
                      <View style={s.row}>
                        <Text style={[s.smallBold, { flex: 1 }]}>{formatFolio(item.folio)}</Text>
                        <View style={badge.pill}>
                          <Text style={badge.text}>{TICKET_ESTADO_LABEL[item.estado]}</Text>
                        </View>
                      </View>
                      <Text style={s.body}>{item.comprador_nombre}</Text>
                      <Text style={s.meta}>
                        {item.evento?.nombre ?? "Evento no disponible"} ·{" "}
                        {item.vendedor?.nombre ?? "—"} · {formatPrecio(item.precio_pagado)} ·{" "}
                        {METODO_LABEL[item.metodo_pago]}
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
