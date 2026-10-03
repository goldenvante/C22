import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { router } from "expo-router";

import { useAuth } from "@/auth/AuthProvider";
import { useEventStyles } from "@/features/events/eventStyles";
import { formatFecha, formatPrecio, toFechaKey, type EventItem, type EventPhase } from "@/features/events/types";
import { hasRole } from "@/lib/supabase";

import { listSellableEvents, listSellablePhases } from "./api";
import {
  faseVigente,
  METODOS_PAGO,
  METODO_LABEL,
  type MetodoPago,
  type NewSaleInput,
} from "./types";

type Props = {
  busy: boolean;
  serverError: string | null;
  onSubmit: (input: NewSaleInput) => void;
};

/** Motivo por el que una fase no admite ventas hoy; null si está disponible. */
function motivoBloqueo(ph: EventPhase, hoy: string): string | null {
  if (!ph.activa) return "Inactiva";
  if (!faseVigente(ph.fecha_inicio, ph.fecha_fin, hoy)) {
    if (ph.fecha_inicio && hoy < ph.fecha_inicio) return `Inicia ${formatFecha(ph.fecha_inicio)}`;
    if (ph.fecha_fin) return `Terminó ${formatFecha(ph.fecha_fin)}`;
    return "Fuera de vigencia";
  }
  return null;
}

function vigenciaLabel(ph: EventPhase): string | null {
  if (ph.fecha_inicio && ph.fecha_fin) {
    return `${formatFecha(ph.fecha_inicio)} – ${formatFecha(ph.fecha_fin)}`;
  }
  return null;
}

export function SaleForm({ busy, serverError, onSubmit }: Props) {
  const { s, p } = useEventStyles();
  const { profile } = useAuth();
  const isAdmin = hasRole(profile, "admin");
  const [events, setEvents] = useState<EventItem[]>([]);
  const [phases, setPhases] = useState<EventPhase[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [loadingPhases, setLoadingPhases] = useState(false);
  const [eventId, setEventId] = useState("");
  const [phaseId, setPhaseId] = useState("");
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [metodo, setMetodo] = useState<MetodoPago>("EFECTIVO");
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    listSellableEvents(isAdmin)
      .then(setEvents)
      .catch((e) => setFormError((e as Error).message))
      .finally(() => setLoadingEvents(false));
  }, [isAdmin]);

  async function handleEventChange(id: string) {
    setEventId(id);
    setPhaseId("");
    setPhases([]);
    if (!id) return;
    setLoadingPhases(true);
    setFormError(null);
    try {
      setPhases(await listSellablePhases(id));
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setLoadingPhases(false);
    }
  }

  const hoy = toFechaKey(new Date());
  const selectedPhase = phases.find((p) => p.id === phaseId) ?? null;

  function handleSubmit() {
    const input: NewSaleInput = {
      event_id: eventId,
      phase_id: phaseId,
      nombre: nombre.trim(),
      telefono: telefono.trim(),
      metodo,
    };
    if (!input.event_id) {
      setFormError("Elige el evento.");
      return;
    }
    if (!input.phase_id) {
      setFormError("Elige la fase.");
      return;
    }
    if (selectedPhase) {
      const motivo = motivoBloqueo(selectedPhase, hoy);
      if (motivo) {
        setFormError(`La fase ${selectedPhase.nombre} no está disponible: ${motivo.toLowerCase()}.`);
        return;
      }
    }
    if (input.nombre.length < 1 || input.nombre.length > 160) {
      setFormError("El nombre del comprador es obligatorio (máx. 160).");
      return;
    }
    if (input.telefono.length > 32) {
      setFormError("El teléfono debe tener 32 caracteres como máximo.");
      return;
    }
    setFormError(null);
    onSubmit(input);
  }

  const message = formError ?? serverError;

  return (
    <View style={{ gap: 4 }}>
      <Text style={s.label}>Evento</Text>
      {loadingEvents ? (
        <ActivityIndicator color={p.primary} />
      ) : events.length === 0 ? (
        isAdmin ? (
          <View style={{ gap: 8 }}>
            <Text style={s.meta}>Aún no hay eventos en tu comité para vender.</Text>
            <Pressable
              onPress={() => router.push("/(admin)/events/new")}
              style={({ pressed }) => [s.secondaryButton, { opacity: pressed ? 0.7 : 1 }]}>
              <Text style={s.secondaryButtonText}>Crear evento</Text>
            </Pressable>
          </View>
        ) : (
          <Text style={s.meta}>No hay eventos publicados por ahora.</Text>
        )
      ) : (
        <View style={{ gap: 8 }}>
          {events.map((ev) => {
            const selected = ev.id === eventId;
            return (
              <Pressable
                key={ev.id}
                disabled={busy}
                onPress={() => handleEventChange(ev.id)}
                style={({ pressed }) => [
                  s.secondaryButton,
                  selected && { backgroundColor: p.primary, borderColor: p.primary },
                  { opacity: pressed || busy ? 0.7 : 1 },
                ]}>
                <Text style={[s.secondaryButtonText, selected && { color: p.onPrimary }]}>
                  {ev.nombre} · {ev.codigo}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {eventId ? (
        <>
          <Text style={s.label}>Fase</Text>
          {loadingPhases ? (
            <ActivityIndicator color={p.primary} />
          ) : phases.length === 0 ? (
            <Text style={s.meta}>Este evento no tiene fases disponibles.</Text>
          ) : (
            <View style={{ gap: 8 }}>
              {phases.map((ph) => {
                const selected = ph.id === phaseId;
                const motivo = motivoBloqueo(ph, hoy);
                const bloqueada = motivo !== null;
                const rango = vigenciaLabel(ph);
                return (
                  <View key={ph.id} style={{ gap: 4 }}>
                    <Pressable
                      disabled={busy || bloqueada}
                      onPress={() => setPhaseId(ph.id)}
                      style={({ pressed }) => [
                        s.secondaryButton,
                        selected && { backgroundColor: p.primary, borderColor: p.primary },
                        { opacity: bloqueada ? 0.5 : pressed || busy ? 0.7 : 1 },
                      ]}>
                      <Text style={[s.secondaryButtonText, selected && { color: p.onPrimary }]}>
                        {ph.nombre} — {formatPrecio(ph.precio)}
                      </Text>
                    </Pressable>
                    {bloqueada ? (
                      <Text style={s.faseOff}>
                        {motivo}
                        {rango && motivo === "Inactiva" ? ` · ${rango}` : ""}
                      </Text>
                    ) : null}
                  </View>
                );
              })}
              {phases.some((ph) => motivoBloqueo(ph, hoy) === null) ? null : (
                <Text style={s.meta}>Ninguna fase está activa y vigente hoy.</Text>
              )}
            </View>
          )}
        </>
      ) : null}

      {selectedPhase ? (
        <Text style={s.meta}>Precio fijado por la fase: {formatPrecio(selectedPhase.precio)}</Text>
      ) : null}

      <Text style={s.label}>Nombre del comprador</Text>
      <TextInput
        value={nombre}
        onChangeText={setNombre}
        placeholder="Nombre completo"
        placeholderTextColor={p.textSoft}
        editable={!busy}
        style={s.input}
      />

      <Text style={s.label}>Teléfono (opcional)</Text>
      <TextInput
        value={telefono}
        onChangeText={setTelefono}
        placeholder="55 1234 5678"
        placeholderTextColor={p.textSoft}
        keyboardType="phone-pad"
        editable={!busy}
        style={s.input}
      />

      <Text style={s.label}>Método de pago</Text>
      <View style={s.row}>
        {METODOS_PAGO.map((m) => {
          const selected = metodo === m;
          return (
            <Pressable
              key={m}
              disabled={busy}
              onPress={() => setMetodo(m)}
              style={({ pressed }) => [
                s.secondaryButton,
                selected && { backgroundColor: p.primary, borderColor: p.primary },
                { opacity: pressed || busy ? 0.7 : 1 },
              ]}>
              <Text style={[s.secondaryButtonText, selected && { color: p.onPrimary }]}>
                {METODO_LABEL[m]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {message ? <Text style={s.error}>{message}</Text> : null}

      <Pressable
        onPress={handleSubmit}
        disabled={busy}
        style={({ pressed }) => [s.primaryButton, { opacity: busy || pressed ? 0.7 : 1 }]}>
        {busy ? (
          <ActivityIndicator color={p.onPrimary} />
        ) : (
          <Text style={s.primaryButtonText}>Registrar venta</Text>
        )}
      </Pressable>
    </View>
  );
}
