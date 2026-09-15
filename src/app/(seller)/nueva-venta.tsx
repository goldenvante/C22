import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { BackHeader } from "@/components/back-header";
import { eventStyles as s } from "@/features/events/eventStyles";
import { formatPrecio } from "@/features/events/types";
import { createSale } from "@/features/sales/api";
import { SaleForm } from "@/features/sales/SaleForm";
import {
  formatFolio,
  METODO_LABEL,
  ticketBadge,
  TICKET_ESTADO_LABEL,
  type NewSaleInput,
  type SaleTicket,
} from "@/features/sales/types";

export default function NuevaVentaScreen() {
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [created, setCreated] = useState<SaleTicket | null>(null);

  async function handleSubmit(input: NewSaleInput) {
    setBusy(true);
    setServerError(null);
    try {
      setCreated(await createSale(input));
    } catch (e) {
      setServerError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function handleAnother() {
    setCreated(null);
    setServerError(null);
  }

  return (
    <View style={s.screen}>
      <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
        <ScrollView contentContainerStyle={s.scroll}>
          <Text style={s.screenTitle}>Nueva venta</Text>
          <View style={s.goldRule} />
          <BackHeader fallback="/(seller)" />

          {created ? (
            <View style={s.card}>
              <Text style={s.sectionTitle}>Venta registrada</Text>
              <Text style={[s.screenTitle, { fontSize: 40 }]}>{formatFolio(created.folio)}</Text>
              <Text style={s.body}>{created.comprador_nombre}</Text>
              <Text style={s.meta}>
                {created.evento?.nombre ?? "Evento"} · {created.fase?.nombre ?? ""}
              </Text>
              <Text style={s.meta}>
                {formatPrecio(created.precio_pagado)} · {METODO_LABEL[created.metodo_pago]}
              </Text>
              <View style={ticketBadge(created.estado).pill}>
                <Text style={ticketBadge(created.estado).text}>
                  {TICKET_ESTADO_LABEL[created.estado]}
                </Text>
              </View>
              <Text style={s.meta}>Boleto digital pendiente de generar.</Text>
            </View>
          ) : (
            <SaleForm busy={busy} serverError={serverError} onSubmit={handleSubmit} />
          )}

          {created ? (
            <>
              <Pressable
                onPress={() =>
                  router.push({ pathname: "/(seller)/boleto/[id]", params: { id: created.id } })
                }
                style={({ pressed }) => [s.primaryButton, { opacity: pressed ? 0.7 : 1 }]}>
                <Text style={s.primaryButtonText}>Ver boleto digital</Text>
              </Pressable>
              <Pressable
                onPress={() =>
                  router.push({ pathname: "/(seller)/ventas/[id]", params: { id: created.id } })
                }
                style={({ pressed }) => [s.secondaryButton, { opacity: pressed ? 0.7 : 1 }]}>
                <Text style={s.secondaryButtonText}>Ver detalle</Text>
              </Pressable>
              <Pressable onPress={handleAnother} style={s.linkWrap}>
                <Text style={s.link}>Registrar otra venta</Text>
              </Pressable>
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
