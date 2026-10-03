import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";

import { BackHeader } from "@/components/back-header";
import { useEventStyles } from "@/features/events/eventStyles";
import { allSales } from "@/features/sales/api";
import {
  TICKET_ESTADO_LABEL,
  ticketBadge,
  type SaleTicket,
  type TicketEstado,
} from "@/features/sales/types";

type Row = { key: string; nombre: string; usuario: string; total: number };

const ESTADOS: TicketEstado[] = ["ACTIVO", "CANCELADO", "UTILIZADO"];

function groupByUser(list: SaleTicket[]): Row[] {
  const map = new Map<string, Row>();
  for (const t of list) {
    const key = t.seller_id || t.id;
    let row = map.get(key);
    if (!row) {
      row = {
        key,
        nombre: t.vendedor?.nombre?.trim() || "Sin usuario asignado",
        usuario: t.vendedor?.usuario?.trim() || "",
        total: 0,
      };
      map.set(key, row);
    }
    row.total += 1;
  }
  return [...map.values()].sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre));
}

function SectionTitle({ children }: { children: string }) {
  const { s } = useEventStyles();
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.sectionTitle}>{children}</Text>
      <View style={s.goldRule} />
    </View>
  );
}

function TotalCard({ total, noun }: { total: number; noun: string }) {
  const { s } = useEventStyles();
  return (
    <View style={s.card}>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
        <Text style={s.folio}>{total}</Text>
        <Text style={s.meta}>{noun}</Text>
      </View>
    </View>
  );
}

function UserRows({ rows }: { rows: Row[] }) {
  const { s, p } = useEventStyles();
  if (rows.length === 0) return <Text style={s.meta}>Sin boletos registrados.</Text>;
  return (
    <View style={{ gap: 8 }}>
      {rows.map((r) => (
        <View key={r.key} style={[s.card, { flexDirection: "row", alignItems: "center", gap: 12 }]}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={s.smallBold}>{r.nombre}</Text>
            {r.usuario ? <Text style={s.meta}>{r.usuario}</Text> : null}
          </View>
          <Text style={[s.sectionTitle, { color: p.primary }]}>{r.total}</Text>
        </View>
      ))}
    </View>
  );
}

/**
 * Resumen de boletos: vendidos y cortesías por usuario con su total general,
 * más el desglose por estado (activos, cancelados y usados). Es una vista de
 * agregación; el detalle fila a fila vive en Ventas y Cortesías.
 */
export default function BoletosScreen() {
  const { s, p } = useEventStyles();
  const [tickets, setTickets] = useState<SaleTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setTickets(await allSales());
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

  const vendidos = tickets.filter((t) => !t.es_cortesia);
  const cortesias = tickets.filter((t) => t.es_cortesia);
  const counts: Record<TicketEstado, number> = { ACTIVO: 0, CANCELADO: 0, UTILIZADO: 0 };
  for (const t of tickets) counts[t.estado] = (counts[t.estado] ?? 0) + 1;

  return (
    <View style={s.screen}>
      <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
        <ScrollView
          contentContainerStyle={[s.scroll, { flexGrow: 1 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
          <Text style={s.screenTitle}>Boletos</Text>
          <View style={s.goldRule} />
          <BackHeader fallback="/(admin)" />
          <Text style={s.meta}>Resumen general de boletos y cortesías.</Text>

          {loading ? (
            <View style={s.center}>
              <ActivityIndicator color={p.primary} />
            </View>
          ) : error ? (
            <Text style={s.error}>{error}</Text>
          ) : (
            <>
              <SectionTitle>Boletos vendidos</SectionTitle>
              <TotalCard total={vendidos.length} noun={vendidos.length === 1 ? "boleto" : "boletos"} />
              <UserRows rows={groupByUser(vendidos)} />

              <SectionTitle>Cortesías</SectionTitle>
              <TotalCard total={cortesias.length} noun={cortesias.length === 1 ? "cortesía" : "cortesías"} />
              <UserRows rows={groupByUser(cortesias)} />

              <SectionTitle>Por estado</SectionTitle>
              <View style={{ gap: 8 }}>
                {ESTADOS.map((estado) => {
                  const b = ticketBadge(estado);
                  return (
                    <View key={estado} style={[s.card, { flexDirection: "row", alignItems: "center", gap: 12 }]}>
                      <View style={b.pill}>
                        <Text style={b.text}>{TICKET_ESTADO_LABEL[estado]}</Text>
                      </View>
                      <View style={{ flex: 1 }} />
                      <Text style={s.sectionTitle}>{counts[estado] ?? 0}</Text>
                    </View>
                  );
                })}
              </View>

              <Text style={s.meta}>
                Total de boletos: {tickets.length}. Los estados incluyen vendidos y cortesías.
              </Text>
            </>
          )}

          <Pressable
            onPress={() => load()}
            style={({ pressed }) => [s.secondaryButton, { opacity: pressed ? 0.7 : 1 }]}>
            <Text style={s.secondaryButtonText}>Actualizar</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
