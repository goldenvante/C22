import { Text, View } from "react-native";

import { C22 } from "@/constants/theme";
import { eventStyles as s } from "@/features/events/eventStyles";
import { formatFolio } from "@/features/sales/types";
import type { ValidateResult } from "./api";

function FaseLine({ fase }: { fase: string | null }) {
  if (!fase) return null;
  return <Text style={s.meta}>Etapa: {fase}</Text>;
}

/**
 * Tarjeta de resultado de validación (escáner y lista de puerta).
 * Códigos EXACTOS de la RPC: no inventar otros.
 */
export function ResultCard({ result, eventName }: { result: ValidateResult; eventName: string | null }) {
  switch (result.code) {
    case "VALIDO":
      return (
        <View style={s.card}>
          <Text style={[s.sectionTitle, { color: C22.success }]}>✓ ACCESO VÁLIDO</Text>
          <Text style={[s.screenTitle, { fontSize: 36 }]}>
            {result.folio !== null ? formatFolio(result.folio) : "—"}
          </Text>
          {eventName ? <Text style={s.body}>{eventName}</Text> : null}
          <FaseLine fase={result.fase} />
          <Text style={s.body}>{result.comprador ?? ""}</Text>
          <Text style={s.meta}>Boleto utilizado correctamente.</Text>
        </View>
      );
    case "YA_UTILIZADO":
      return (
        <View style={s.card}>
          <Text style={[s.sectionTitle, { color: C22.wine }]}>⚠ BOLETO YA UTILIZADO</Text>
          <Text style={[s.screenTitle, { fontSize: 36 }]}>
            {result.folio !== null ? formatFolio(result.folio) : "—"}
          </Text>
          <FaseLine fase={result.fase} />
          <Text style={s.meta}>Este boleto ya registró su entrada.</Text>
        </View>
      );
    case "CANCELADO":
      return (
        <View style={s.card}>
          <Text style={[s.sectionTitle, { color: C22.danger }]}>✕ BOLETO CANCELADO</Text>
          <Text style={[s.screenTitle, { fontSize: 36 }]}>
            {result.folio !== null ? formatFolio(result.folio) : "—"}
          </Text>
          <FaseLine fase={result.fase} />
          <Text style={s.meta}>Este boleto fue cancelado y no permite entrada.</Text>
        </View>
      );
    case "EVENTO_INCORRECTO":
      return (
        <View style={s.card}>
          <Text style={[s.sectionTitle, { color: C22.danger }]}>✕ BOLETO DE OTRO EVENTO</Text>
          {result.folio !== null ? (
            <Text style={[s.screenTitle, { fontSize: 36 }]}>{formatFolio(result.folio)}</Text>
          ) : null}
          <FaseLine fase={result.fase} />
          <Text style={s.meta}>Este boleto no pertenece al evento del control.</Text>
        </View>
      );
    case "NO_AUTORIZADO":
      return (
        <View style={s.card}>
          <Text style={[s.sectionTitle, { color: C22.danger }]}>✕ SIN AUTORIZACIÓN</Text>
          <Text style={s.meta}>Tu sesión no tiene permiso. Vuelve e inicia sesión de nuevo.</Text>
        </View>
      );
    case "NO_EXISTE":
    default:
      return (
        <View style={s.card}>
          <Text style={[s.sectionTitle, { color: C22.danger }]}>✕ BOLETO NO VÁLIDO</Text>
          <Text style={s.meta}>El código no corresponde a ningún boleto.</Text>
        </View>
      );
  }
}
