import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";

import { BackHeader } from "@/components/back-header";
import { useAuth } from "@/auth/AuthProvider";
import { C22 } from "@/constants/theme";
import { eventStyles as s } from "@/features/events/eventStyles";
import { formatFecha, formatPrecio } from "@/features/events/types";
import {
  applyFilters,
  computeSummary,
  EMPTY_FILTERS,
  groupByEvent,
  groupByPhase,
  groupBySeller,
  loadReportTickets,
  type GroupRow,
  type ReportFilters,
} from "@/features/reports/api";
import { exportReportPdf, exportReportXlsx } from "@/features/reports/xlsx";
import {
  formatFolio,
  METODOS_PAGO,
  METODO_LABEL,
  ticketBadge,
  TICKET_ESTADO_LABEL,
  type MetodoPago,
  type SaleTicket,
  type TicketEstado,
} from "@/features/sales/types";

const ESTADOS: (TicketEstado | "TODOS")[] = ["TODOS", "ACTIVO", "UTILIZADO", "CANCELADO"];
const ESTADO_LABEL: Record<TicketEstado | "TODOS", string> = {
  TODOS: "Todos",
  ACTIVO: "Activos",
  UTILIZADO: "Utilizados",
  CANCELADO: "Cancelados",
};
const METODOS: (MetodoPago | "TODOS")[] = ["TODOS", ...METODOS_PAGO];

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        s.secondaryButton,
        selected && { backgroundColor: C22.wine, borderColor: C22.wine },
        { opacity: pressed ? 0.7 : 1, paddingHorizontal: 12 },
      ]}>
      <Text style={[s.secondaryButtonText, selected && { color: C22.cream }]}>{label}</Text>
    </Pressable>
  );
}

function Kpi({ value, label }: { value: string; label: string }) {
  return (
    <View style={[s.card, { flex: 1, minWidth: 100, alignItems: "center" }]}>
      <Text style={[s.screenTitle, { fontSize: 22 }]}>{value}</Text>
      <Text style={s.meta}>{label}</Text>
    </View>
  );
}

function GroupSection({ title, rows }: { title: string; rows: GroupRow[] }) {
  if (rows.length === 0) return null;
  return (
    <View style={{ gap: 8 }}>
      <Text style={s.sectionTitle}>{title}</Text>
      {rows.map((g) => (
        <View key={g.key} style={s.card}>
          <Text style={s.smallBold}>{g.label}</Text>
          <Text style={s.meta}>
            {g.cantidad} boletos · {formatPrecio(g.ingresos)}
          </Text>
        </View>
      ))}
    </View>
  );
}

type DateField = "desde" | "hasta" | null;

export default function ReporteScreen() {
  const { profile } = useAuth();
  const [tickets, setTickets] = useState<SaleTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ReportFilters>(EMPTY_FILTERS);
  const [dateField, setDateField] = useState<DateField>(null);
  const [exporting, setExporting] = useState<"csv" | "pdf" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setTickets(await loadReportTickets());
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

  const events = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of tickets) map.set(t.event_id, t.evento?.nombre ?? "Evento no disponible");
    return [...map.entries()];
  }, [tickets]);
  const sellers = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of tickets) map.set(t.seller_id, t.vendedor?.nombre ?? "Vendedor");
    return [...map.entries()];
  }, [tickets]);
  const phases = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of tickets) {
      if (t.phase_id) map.set(t.phase_id, t.fase?.nombre ?? "Fase");
    }
    return [...map.entries()];
  }, [tickets]);

  const filtered = useMemo(() => applyFilters(tickets, filters), [tickets, filters]);
  const summary = useMemo(() => computeSummary(filtered), [filtered]);

  const filtersDesc = useMemo(() => {
    const parts: string[] = [];
    const ev = events.find(([id]) => id === filters.eventId);
    if (ev) parts.push(`Evento: ${ev[1]}`);
    const se = sellers.find(([id]) => id === filters.sellerId);
    if (se) parts.push(`Vendedor: ${se[1]}`);
    const ph = phases.find(([id]) => id === filters.phaseId);
    if (ph) parts.push(`Fase: ${ph[1]}`);
    if (filters.estado !== "TODOS") parts.push(`Estado: ${ESTADO_LABEL[filters.estado]}`);
    if (filters.metodo !== "TODOS") parts.push(`Método: ${METODO_LABEL[filters.metodo]}`);
    if (filters.desde) parts.push(`Desde: ${filters.desde}`);
    if (filters.hasta) parts.push(`Hasta: ${filters.hasta}`);
    return parts.join(" · ");
  }, [filters, events, sellers, phases]);

  const money = (n: number) => formatPrecio(n);

  function openDatePicker(field: Exclude<DateField, null>) {
    const current = filters[field];
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(current);
    setModalDate(m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date());
    setDateField(field);
  }

  function handleDateChange(event: DateTimePickerEvent, selected?: Date) {
    if (event.type === "dismissed" || !dateField) {
      setDateField(null);
      return;
    }
    if (Platform.OS === "ios") return; // Se confirma con Aceptar (modalDate abajo).
    if (selected) {
      const key = `${selected.getFullYear()}-${String(selected.getMonth() + 1).padStart(2, "0")}-${String(selected.getDate()).padStart(2, "0")}`;
      setFilters((f) => ({ ...f, [dateField]: key }));
    }
    setDateField(null);
  }

  const [modalDate, setModalDate] = useState(new Date());

  async function handleExportCsv() {
    if (exporting) return;
    setExporting("csv");
    setExportError(null);
    try {
      const now = new Date();
      await exportReportXlsx(filtered, reportMeta(now));
    } catch (e) {
      setExportError((e as Error).message);
    } finally {
      setExporting(null);
    }
  }

  function reportMeta(now: Date) {
    const periodo =
      filters.desde || filters.hasta
        ? `${filters.desde ? formatFecha(filters.desde) : "…"} – ${filters.hasta ? formatFecha(filters.hasta) : "…"}`
        : "Todo";
    return {
      evento: events.find(([id]) => id === filters.eventId)?.[1] ?? "Todos",
      periodo,
      generado: `${now.toLocaleDateString("es-MX")} ${now.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}`,
      generadoPor: profile?.nombre ?? profile?.usuario ?? "Admin",
    };
  }

  async function handleExportPdf() {
    if (exporting) return;
    setExporting("pdf");
    setExportError(null);
    try {
      const now = new Date();
      await exportReportPdf(filtered, reportMeta(now));
    } catch (e) {
      setExportError((e as Error).message);
    } finally {
      setExporting(null);
    }
  }

  function confirmModalDate() {
    if (!dateField) return;
    const key = `${modalDate.getFullYear()}-${String(modalDate.getMonth() + 1).padStart(2, "0")}-${String(modalDate.getDate()).padStart(2, "0")}`;
    setFilters((f) => ({ ...f, [dateField]: key }));
    setDateField(null);
  }

  return (
    <View style={s.screen}>
      <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
        <View style={[s.scroll, { flex: 1 }]}>
          <Text style={s.screenTitle}>Reporte de ventas</Text>
          <View style={s.goldRule} />
          <BackHeader fallback="/(admin)" />

          {loading ? (
            <ActivityIndicator color={C22.wine} />
          ) : error ? (
            <View style={{ gap: 8 }}>
              <Text style={s.error}>{error}</Text>
              <Pressable
                onPress={() => {
                  setLoading(true);
                  load();
                }}
                style={({ pressed }) => [s.secondaryButton, { opacity: pressed ? 0.7 : 1 }]}>
                <Text style={s.secondaryButtonText}>Reintentar</Text>
              </Pressable>
            </View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ gap: 12, paddingBottom: 24 }}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
              ListHeaderComponent={
                <View style={{ gap: 12, paddingBottom: 12 }}>
                  <Text style={s.sectionTitle}>Filtros</Text>
                  <Text style={s.label}>Evento</Text>
                  <View style={[s.row, { flexWrap: "wrap" }]}>
                    <Chip label="Todos" selected={!filters.eventId} onPress={() => setFilters((f) => ({ ...f, eventId: "" }))} />
                    {events.map(([id, nombre]) => (
                      <Chip key={id} label={nombre} selected={filters.eventId === id} onPress={() => setFilters((f) => ({ ...f, eventId: id }))} />
                    ))}
                  </View>
                  <Text style={s.label}>Vendedor</Text>
                  <View style={[s.row, { flexWrap: "wrap" }]}>
                    <Chip label="Todos" selected={!filters.sellerId} onPress={() => setFilters((f) => ({ ...f, sellerId: "" }))} />
                    {sellers.map(([id, nombre]) => (
                      <Chip key={id} label={nombre} selected={filters.sellerId === id} onPress={() => setFilters((f) => ({ ...f, sellerId: id }))} />
                    ))}
                  </View>
                  <Text style={s.label}>Fase</Text>
                  <View style={[s.row, { flexWrap: "wrap" }]}>
                    <Chip label="Todas" selected={!filters.phaseId} onPress={() => setFilters((f) => ({ ...f, phaseId: "" }))} />
                    {phases.map(([id, nombre]) => (
                      <Chip key={id} label={nombre} selected={filters.phaseId === id} onPress={() => setFilters((f) => ({ ...f, phaseId: id }))} />
                    ))}
                  </View>
                  <Text style={s.label}>Estado</Text>
                  <View style={[s.row, { flexWrap: "wrap" }]}>
                    {ESTADOS.map((e) => (
                      <Chip key={e} label={ESTADO_LABEL[e]} selected={filters.estado === e} onPress={() => setFilters((f) => ({ ...f, estado: e }))} />
                    ))}
                  </View>
                  <Text style={s.label}>Método de pago</Text>
                  <View style={[s.row, { flexWrap: "wrap" }]}>
                    {METODOS.map((m) => (
                      <Chip key={m} label={m === "TODOS" ? "Todos" : METODO_LABEL[m]} selected={filters.metodo === m} onPress={() => setFilters((f) => ({ ...f, metodo: m }))} />
                    ))}
                  </View>
                  <Text style={s.label}>Rango de fechas (venta)</Text>
                  <View style={s.row}>
                    <Pressable
                      onPress={() => openDatePicker("desde")}
                      style={({ pressed }) => [s.secondaryButton, { opacity: pressed ? 0.7 : 1 }]}>
                      <Text style={s.secondaryButtonText}>
                        {filters.desde ? formatFecha(filters.desde) : "Desde…"}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => openDatePicker("hasta")}
                      style={({ pressed }) => [s.secondaryButton, { opacity: pressed ? 0.7 : 1 }]}>
                      <Text style={s.secondaryButtonText}>
                        {filters.hasta ? formatFecha(filters.hasta) : "Hasta…"}
                      </Text>
                    </Pressable>
                    <Pressable onPress={() => setFilters(EMPTY_FILTERS)}>
                      <Text style={s.link}>Limpiar filtros</Text>
                    </Pressable>
                  </View>

                  <Text style={s.sectionTitle}>Resumen ({filtered.length})</Text>
                  <View style={[s.row, { flexWrap: "wrap" }]}>
                    <Kpi value={String(summary.vendidos)} label="Vendidos" />
                    <Kpi value={money(summary.ingresos)} label="Ingresos" />
                    <Kpi value={String(summary.cortesias)} label="Cortesías" />
                    <Kpi value={String(summary.utilizados)} label="Utilizados" />
                    <Kpi value={String(summary.cancelados)} label="Cancelados" />
                  </View>

                  <GroupSection title="Por evento" rows={groupByEvent(filtered)} />
                  <GroupSection title="Por fase" rows={groupByPhase(filtered)} />
                  <GroupSection title="Por vendedor" rows={groupBySeller(filtered)} />

                  <Text style={s.sectionTitle}>Detalle</Text>
                </View>
              }
              ListEmptyComponent={<Text style={s.meta}>Sin ventas para estos filtros.</Text>}
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
                        {item.evento?.nombre ?? ""} · {item.fase?.nombre ?? ""}
                        {item.es_cortesia ? " · Cortesía" : ""}
                      </Text>
                      <Text style={s.meta}>
                        {formatPrecio(item.precio_pagado)} · {METODO_LABEL[item.metodo_pago]}
                      </Text>
                    </View>
                  </Pressable>
                );
              }}
              ListFooterComponent={
                <View style={{ gap: 8, paddingTop: 8 }}>
                  {exportError ? <Text style={s.error}>{exportError}</Text> : null}
                  <Pressable
                    onPress={handleExportCsv}
                    disabled={exporting !== null}
                    style={({ pressed }) => [s.secondaryButton, { opacity: exporting !== null || pressed ? 0.6 : 1 }]}>
                    <Text style={s.secondaryButtonText}>
                      {exporting === "csv" ? "Exportando…" : "Exportar Excel"}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={handleExportPdf}
                    disabled={exporting !== null}
                    style={({ pressed }) => [s.secondaryButton, { opacity: exporting !== null || pressed ? 0.6 : 1 }]}>
                    <Text style={s.secondaryButtonText}>
                      {exporting === "pdf" ? "Generando…" : "Generar PDF"}
                    </Text>
                  </Pressable>
                </View>
              }
            />
          )}

          {dateField && Platform.OS === "android" ? (
            <DateTimePicker value={modalDate} mode="date" display="default" onChange={handleDateChange} />
          ) : null}
          <Modal
            visible={dateField !== null && Platform.OS === "ios"}
            transparent
            animationType="fade"
            onRequestClose={() => setDateField(null)}>
            <View style={s.modalOverlay}>
              <View style={s.modalCard}>
                <DateTimePicker
                  value={modalDate}
                  mode="date"
                  display="inline"
                  locale="es-ES"
                  themeVariant="light"
                  onChange={(_e, d) => {
                    if (d) setModalDate(d);
                  }}
                />
                <View style={s.row}>
                  <Pressable
                    onPress={() => setDateField(null)}
                    style={({ pressed }) => [s.secondaryButton, { opacity: pressed ? 0.7 : 1 }]}>
                    <Text style={s.secondaryButtonText}>Cancelar</Text>
                  </Pressable>
                  <Pressable
                    onPress={confirmModalDate}
                    style={({ pressed }) => [s.primaryButton, { flex: 1, marginTop: 0, opacity: pressed ? 0.7 : 1 }]}>
                    <Text style={s.primaryButtonText}>Aceptar</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </Modal>
        </View>
      </SafeAreaView>
    </View>
  );
}
