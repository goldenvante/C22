import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import { BackHeader } from "@/components/back-header";
import { useEventStyles } from "@/features/events/eventStyles";
import { formatPrecio } from "@/features/events/types";
import { mySales } from "@/features/sales/api";
import {
  formatFolio,
  TICKET_ESTADO_LABEL,
  ticketBadge,
  type SaleTicket,
} from "@/features/sales/types";

type TabKey = "vigentes" | "cancelados";

const TABS: { key: TabKey; label: string }[] = [
  { key: "vigentes", label: "Vigentes" },
  { key: "cancelados", label: "Cancelados" },
];

type EventGroup = {
  key: string;
  nombre: string;
  codigo: string;
  fecha: string | null;
  tickets: SaleTicket[];
};

/** Boletos propios agrupados por evento, del más reciente al más antiguo. */
function groupByEvent(list: SaleTicket[]): EventGroup[] {
  const map = new Map<string, EventGroup>();
  for (const t of list) {
    const key = t.event_id || "sin-evento";
    let g = map.get(key);
    if (!g) {
      g = {
        key,
        nombre: t.evento?.nombre?.trim() || "Evento sin nombre",
        codigo: t.evento?.codigo?.trim() || "",
        fecha: t.evento?.fecha ?? null,
        tickets: [],
      };
      map.set(key, g);
    }
    g.tickets.push(t);
  }
  return [...map.values()].sort((a, b) =>
    String(b.fecha ?? "").localeCompare(String(a.fecha ?? "")),
  );
}

/**
 * Boletos (vendedor): los boletos que ha generado, agrupados por evento, con
 * la pestaña de cancelados aparte. Es su propio listado (RLS solo devuelve lo
 * suyo); el detalle fila a fila está en Mis ventas.
 */
export default function SellerBoletos() {
  const { s, p } = useEventStyles();
  const [tickets, setTickets] = useState<SaleTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("vigentes");

  const load = useCallback(async () => {
    try {
      setError(null);
      setTickets(await mySales());
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

  const visibles = tickets.filter((t) =>
    tab === "cancelados" ? t.estado === "CANCELADO" : t.estado !== "CANCELADO",
  );
  const grupos = groupByEvent(visibles);

  return (
    <View style={s.screen}>
      <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
        <ScrollView
          contentContainerStyle={[s.scroll, { flexGrow: 1 }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
            />
          }>
          <Text style={s.screenTitle}>Boletos</Text>
          <View style={s.goldRule} />
          <BackHeader fallback="/(seller)" />
          <Text style={s.meta}>
            {visibles.length === 1 ? "1 boleto" : `${visibles.length} boletos`}
            {tab === "cancelados" ? " cancelados." : " vigentes."}
          </Text>

          <View style={{ flexDirection: "row", gap: 8 }}>
            {TABS.map((t) => {
              const on = tab === t.key;
              return (
                <Pressable
                  key={t.key}
                  onPress={() => setTab(t.key)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  style={({ pressed }) => [
                    s.secondaryButton,
                    {
                      flex: 1,
                      opacity: pressed ? 0.7 : 1,
                      backgroundColor: on ? p.primary : p.secondaryBg,
                      borderColor: on ? p.primary : p.border,
                    },
                  ]}>
                  <Text
                    style={[
                      s.secondaryButtonText,
                      { color: on ? p.onPrimary : p.title },
                    ]}>
                    {t.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {loading ? (
            <View style={s.center}>
              <ActivityIndicator color={p.primary} />
            </View>
          ) : error ? (
            <Text style={s.error}>{error}</Text>
          ) : grupos.length === 0 ? (
            <Text style={s.meta}>
              {tab === "cancelados"
                ? "No tienes boletos cancelados."
                : "Aún no has generado boletos."}
            </Text>
          ) : (
            <View style={{ gap: 20 }}>
              {grupos.map((g) => (
                <View key={g.key} style={{ gap: 8 }}>
                  <View style={{ gap: 6 }}>
                    <View style={s.row}>
                      <Text style={[s.sectionTitle, { flex: 1 }]} numberOfLines={1}>
                        {g.nombre}
                      </Text>
                      {g.codigo ? <Text style={s.smallBold}>{g.codigo}</Text> : null}
                    </View>
                    <View style={s.goldRule} />
                    <Text style={s.meta}>
                      {g.tickets.length === 1 ? "1 boleto" : `${g.tickets.length} boletos`}
                    </Text>
                  </View>

                  {g.tickets.map((t) => {
                    const b = ticketBadge(t.estado);
                    return (
                      <Pressable
                        key={t.id}
                        onPress={() =>
                          router.push({
                            pathname: "/(seller)/boleto/[id]",
                            params: { id: t.id },
                          })
                        }
                        accessibilityRole="button"
                        accessibilityLabel={`Boleto ${formatFolio(t.folio, t.evento?.codigo ?? "")}`}
                        style={({ pressed }) => [
                          s.card,
                          { opacity: pressed ? 0.7 : 1 },
                        ]}>
                        <View style={s.row}>
                          <Text style={[s.smallBold, { flex: 1 }]}>
                            {formatFolio(t.folio, t.evento?.codigo ?? "")}
                          </Text>
                          <View style={b.pill}>
                            <Text style={b.text}>{TICKET_ESTADO_LABEL[t.estado]}</Text>
                          </View>
                        </View>
                        <Text style={s.meta} numberOfLines={1}>
                          {t.comprador_nombre || "Sin comprador"} ·{" "}
                          {t.fase?.nombre ?? "General"} · {formatPrecio(t.precio_pagado)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
