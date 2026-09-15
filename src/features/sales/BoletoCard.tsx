import { forwardRef } from "react";
import { Text, useWindowDimensions, View } from "react-native";
import { ImageBackground } from "expo-image";

import { C22 } from "@/constants/theme";
import { TicketQr } from "@/features/sales/TicketQr";
import { formatFolio, type TicketEstado } from "@/features/sales/types";

/**
 * Datos mínimos para el boleto. SaleTicket es asignable (tiene estos campos
 * más otros que aquí se ignoran: fase, precio, método, etc.).
 */
export type BoletoData = {
  id: string;
  folio: number;
  comprador_nombre: string;
  estado: TicketEstado;
  /** True = boleto gratis (sin fase visible, precio 0). */
  es_cortesia: boolean;
  qr_token: string;
  evento: {
    nombre: string;
    fecha: string | null;
    hora: string | null;
    lugar: string | null;
    imagen_url: string | null;
    mapas_url: string | null;
  } | null;
};

const MESES_CORTO = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
const MESES_LARGO = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function splitFecha(fecha: string | null): { y: string; m: string; d: string } | null {
  const parts = (fecha ?? "").split("-");
  if (parts.length !== 3) return null;
  const [y, m, d] = parts;
  if (!y || !m || !d) return null;
  return { y, m, d };
}

function fechaCorta(fecha: string | null): string | null {
  const p = splitFecha(fecha);
  if (!p) return null;
  const idx = Number(p.m) - 1;
  const mes = MESES_CORTO[idx] ?? p.m;
  return `${Number(p.d)} . ${mes} . ${p.y}`;
}

function fechaLarga(fecha: string | null): string | null {
  const p = splitFecha(fecha);
  if (!p) return null;
  const idx = Number(p.m) - 1;
  const mes = MESES_LARGO[idx] ?? p.m;
  return `${Number(p.d)} de ${mes} de ${p.y}`;
}

function horaCorta(hora: string | null): string | null {
  if (!hora) return null;
  const hhmm = hora.slice(0, 5);
  return /^\d{2}:\d{2}$/.test(hhmm) ? `${hhmm} hrs` : null;
}

function Corner({ style }: { style: object }) {
  return <View pointerEvents="none" style={[{ position: "absolute", width: 26, height: 26 }, style]} />;
}

/**
 * Boleto digital premium (réplica de referencia): foto full-bleed con scrim
 * integral, marca, título, fecha, QR central con marcas de visor sobre
 * superficie clara, folio, comprador, divisor e info inferior.
 * Sin fase, precio, método ni datos técnicos. Con ref para captura.
 */
export const BoletoCard = forwardRef<View, { sale: BoletoData }>(function BoletoCard(
  { sale },
  ref,
) {
  const { width } = useWindowDimensions();
  const qrSize = Math.min(170, Math.max(130, width - 230));
  const cancelled = sale.estado === "CANCELADO";
  const fecha = fechaCorta(sale.evento?.fecha ?? null);
  const fechaLong = fechaLarga(sale.evento?.fecha ?? null);
  const hora = horaCorta(sale.evento?.hora ?? null);

  return (
    <View
      ref={ref}
      collapsable={false}
      style={{
        borderRadius: 26,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: C22.gold,
        backgroundColor: "#181014",
      }}>
      <ImageBackground
        source={sale.evento?.imagen_url ? { uri: sale.evento.imagen_url } : null}
        contentFit="cover"
        style={{ width: "100%", aspectRatio: 9 / 15.5 }}>
        <View style={{ flex: 1, backgroundColor: "rgba(14, 6, 9, 0.60)" }}>
          <View style={{ alignItems: "center", paddingTop: 26, paddingHorizontal: 24, gap: 6 }}>
            <Text style={{ fontSize: 10, letterSpacing: 4, color: C22.gold, fontWeight: "700" }}>
              COMITÉ C22 · ACCESO DIGITAL
            </Text>
            <Text
              numberOfLines={3}
              ellipsizeMode="tail"
              style={{ fontSize: 36, fontWeight: "800", color: C22.cream, textAlign: "center" }}>
              {(sale.evento?.nombre ?? "Evento no disponible").toUpperCase()}
            </Text>
            {fecha ? (
              <Text style={{ fontSize: 14, letterSpacing: 3, color: C22.cream, fontWeight: "600" }}>
                {fecha}
              </Text>
            ) : null}
            {sale.evento?.lugar ? (
              <Text
                numberOfLines={1}
                ellipsizeMode="tail"
                style={{ fontSize: 12, letterSpacing: 2, color: C22.cream }}>
                {sale.evento.lugar.toUpperCase()}
              </Text>
            ) : null}
          </View>

          <View style={{ alignItems: "center", paddingVertical: 14 }}>
            <View style={{ padding: 14 }}>
              <Corner
                style={{ top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderColor: C22.cream }}
              />
              <Corner
                style={{ top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderColor: C22.cream }}
              />
              <Corner
                style={{ bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderColor: C22.cream }}
              />
              <Corner
                style={{ bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderColor: C22.cream }}
              />
              <View style={{ backgroundColor: C22.creamLight, borderRadius: 8, padding: 12 }}>
                <TicketQr qrToken={sale.qr_token} size={qrSize} />
              </View>
            </View>
            <Text style={{ fontSize: 17, letterSpacing: 4, color: C22.cream, fontWeight: "700", marginTop: 10 }}>
              {formatFolio(sale.folio)}
            </Text>
          </View>

          <View style={{ alignItems: "center", paddingHorizontal: 24, gap: 2 }}>
            <Text
              numberOfLines={2}
              ellipsizeMode="tail"
              style={{ fontSize: 22, fontWeight: "600", color: C22.cream, textAlign: "center" }}>
              {sale.comprador_nombre}
            </Text>
            {cancelled ? (
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "800",
                  color: C22.cream,
                  backgroundColor: C22.danger,
                  borderRadius: 999,
                  paddingVertical: 5,
                  paddingHorizontal: 16,
                  overflow: "hidden",
                  marginTop: 4,
                }}>
                BOLETO CANCELADO
              </Text>
            ) : sale.es_cortesia ? (
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "800",
                  color: C22.cream,
                  backgroundColor: C22.wine,
                  borderRadius: 999,
                  paddingVertical: 5,
                  paddingHorizontal: 16,
                  overflow: "hidden",
                  marginTop: 4,
                }}>
                CORTESÍA
              </Text>
            ) : null}
          </View>

          <View
            style={{
              marginHorizontal: 40,
              marginTop: 12,
              borderTopWidth: 1,
              borderTopColor: "rgba(247, 239, 227, 0.35)",
            }}
          />

          <View style={{ paddingHorizontal: 40, paddingVertical: 12, gap: 8 }}>
            <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
              <View style={{ flex: 1, gap: 8 }}>
                {fechaLong || hora ? (
                  <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                    <Text style={{ fontSize: 18, color: C22.cream }}>📅</Text>
                    <View>
                      {fechaLong ? (
                        <Text style={{ fontSize: 14, color: C22.cream }}>{fechaLong}</Text>
                      ) : null}
                      {hora ? <Text style={{ fontSize: 14, color: C22.cream }}>{hora}</Text> : null}
                    </View>
                  </View>
                ) : null}
                {sale.evento?.lugar ? (
                  <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                    <Text style={{ fontSize: 18, color: C22.cream }}>📍</Text>
                    <Text numberOfLines={2} ellipsizeMode="tail" style={{ fontSize: 14, color: C22.cream, flex: 1 }}>
                      {sale.evento.lugar}
                    </Text>
                  </View>
                ) : null}
              </View>
              {sale.evento?.mapas_url ? (
                <View style={{ alignItems: "center", gap: 3 }}>
                  <TicketQr
                    qrToken={sale.evento.mapas_url}
                    size={84}
                    color={C22.cream}
                    backgroundColor="transparent"
                    quietZone={6}
                    ecl="H"
                  />
                  <Text style={{ fontSize: 8, letterSpacing: 1, color: C22.gold, fontWeight: "800" }}>
                    CÓMO LLEGAR
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          <Text
            style={{
              textAlign: "center",
              fontSize: 9,
              letterSpacing: 4,
              color: "rgba(247, 239, 227, 0.6)",
              paddingBottom: 18,
            }}>
            COMITÉ C22
          </Text>
        </View>
      </ImageBackground>
    </View>
  );
});
