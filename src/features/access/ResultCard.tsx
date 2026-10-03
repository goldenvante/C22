import { Text, View } from "react-native";

import { useEventStyles } from "@/features/events/eventStyles";
import { formatFolio } from "@/features/sales/types";
import type { ValidateResult } from "./api";

function FaseLine({ fase }: { fase: string | null }) {
  const { s } = useEventStyles();
  if (!fase) return null;
  return <Text style={s.meta}>Etapa: {fase}</Text>;
}

/**
 * Tarjeta de resultado de validación (escáner y lista de puerta).
 * Códigos EXACTOS de la RPC: no inventar otros.
 */
export function ResultCard({
  result,
  eventName,
  eventCode,
}: {
  result: ValidateResult;
  eventName: string | null;
  /** Código corto del evento del control: forma el prefijo del folio. */
  eventCode: string;
}) {
  const { s, p } = useEventStyles();
  switch (result.code) {
    case "VALIDO":
      return (
        <View style={s.card}>
          <Text style={[s.sectionTitle, { color: p.success }]}>✓ ACCESO VÁLIDO</Text>
          <Text style={s.folio}>
            {result.folio !== null ? formatFolio(result.folio, eventCode) : "—"}
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
          <Text style={[s.sectionTitle, { color: p.primary }]}>△ BOLETO YA UTILIZADO</Text>
          <Text style={s.folio}>
            {result.folio !== null ? formatFolio(result.folio, eventCode) : "—"}
          </Text>
          <FaseLine fase={result.fase} />
          <Text style={s.meta}>Este boleto ya registró su entrada.</Text>
        </View>
      );
    case "CANCELADO":
      return (
        <View style={s.card}>
          <Text style={[s.sectionTitle, { color: p.danger }]}>✕ BOLETO CANCELADO</Text>
          <Text style={s.folio}>
            {result.folio !== null ? formatFolio(result.folio, eventCode) : "—"}
          </Text>
          <FaseLine fase={result.fase} />
          <Text style={s.meta}>Este boleto fue cancelado y no permite entrada.</Text>
        </View>
      );
    case "EVENTO_INCORRECTO":
      return (
        <View style={s.card}>
          <Text style={[s.sectionTitle, { color: p.danger }]}>✕ BOLETO DE OTRO EVENTO</Text>
          {result.folio !== null ? (
            <Text style={s.folio}>{formatFolio(result.folio, eventCode)}</Text>
          ) : null}
          <FaseLine fase={result.fase} />
          <Text style={s.meta}>Este boleto no pertenece al evento del control.</Text>
        </View>
      );
    case "NO_AUTORIZADO":
      return (
        <View style={s.card}>
          <Text style={[s.sectionTitle, { color: p.danger }]}>✕ SIN AUTORIZACIÓN</Text>
          <Text style={s.meta}>Tu sesión no tiene permiso. Vuelve e inicia sesión de nuevo.</Text>
        </View>
      );
    case "NO_EXISTE":
    default:
      return (
        <View style={s.card}>
          <Text style={[s.sectionTitle, { color: p.danger }]}>✕ BOLETO NO VÁLIDO</Text>
          <Text style={s.meta}>El código no corresponde a ningún boleto.</Text>
        </View>
      );
  }
}
