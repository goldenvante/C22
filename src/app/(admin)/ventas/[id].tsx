import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams } from "expo-router";

import { BackHeader } from "@/components/back-header";
import { C22 } from "@/constants/theme";
import { eventStyles as s } from "@/features/events/eventStyles";
import { formatPrecio } from "@/features/events/types";
import { cancelSale, getSale } from "@/features/sales/api";
import {
  formatFolio,
  METODO_LABEL,
  ticketBadge,
  TICKET_ESTADO_LABEL,
  type SaleTicket,
} from "@/features/sales/types";

export default function AdminVentaDetalleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [sale, setSale] = useState<SaleTicket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) {
      setError("Venta no válida.");
      setLoading(false);
      return;
    }
    try {
      setError(null);
      const found = await getSale(id);
      if (!found) setError("La venta no existe.");
      setSale(found);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  function confirmCancel() {
    if (!sale) return;
    Alert.alert(
      "Cancelar venta",
      `¿Cancelar el boleto ${formatFolio(sale.folio)} de ${sale.comprador_nombre}? El folio quedará consumido y no se reutilizará.`,
      [
        { text: "Volver", style: "cancel" },
        {
          text: "Cancelar venta",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            setError(null);
            try {
              await cancelSale(sale.id);
              await load();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  }

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={C22.wine} />
      </View>
    );
  }

  return (
    <View style={s.screen}>
      <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
        <ScrollView contentContainerStyle={s.scroll}>
          {error && !sale ? (
            <Text style={s.error}>{error}</Text>
          ) : sale ? (
            <>
              <BackHeader fallback="/(admin)/ventas" />
              <Text style={[s.screenTitle, { fontSize: 40 }]}>{formatFolio(sale.folio)}</Text>
              <View style={s.goldRule} />
              <View style={ticketBadge(sale.estado).pill}>
                <Text style={ticketBadge(sale.estado).text}>
                  {TICKET_ESTADO_LABEL[sale.estado]}
                </Text>
              </View>

              <View style={s.card}>
                <Text style={s.sectionTitle}>{sale.comprador_nombre}</Text>
                {sale.comprador_telefono ? (
                  <Text style={s.meta}>Tel: {sale.comprador_telefono}</Text>
                ) : null}
                <Text style={s.body}>{sale.evento?.nombre ?? "Evento no disponible"}</Text>
                {sale.es_cortesia || !sale.fase ? null : (
                  <Text style={s.meta}>Fase: {sale.fase.nombre}</Text>
                )}
                <Text style={s.meta}>Precio pagado: {formatPrecio(sale.precio_pagado)}</Text>
                <Text style={s.meta}>Método: {METODO_LABEL[sale.metodo_pago]}</Text>
                {sale.es_cortesia ? (
                  <Text style={[s.smallBold, { color: C22.wine }]}>CORTESÍA</Text>
                ) : null}
                <Text style={s.meta}>
                  Vendedor: {sale.vendedor?.nombre ?? "—"}
                  {sale.vendedor ? ` (@${sale.vendedor.usuario})` : ""}
                </Text>
              </View>

              {sale.estado === "ACTIVO" ? (
                <Pressable
                  disabled={busy}
                  onPress={confirmCancel}
                  style={({ pressed }) => [s.dangerButton, { opacity: busy || pressed ? 0.7 : 1 }]}>
                  {busy ? (
                    <ActivityIndicator color={C22.cream} />
                  ) : (
                    <Text style={s.dangerButtonText}>Cancelar venta</Text>
                  )}
                </Pressable>
              ) : (
                <Text style={s.meta}>
                  {sale.estado === "CANCELADO"
                    ? "Venta cancelada. El folio permanece consumido."
                    : "Boleto ya utilizado."}
                </Text>
              )}
              {error ? <Text style={s.error}>{error}</Text> : null}
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
