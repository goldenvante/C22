import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";

import { C22 } from "@/constants/theme";
import { eventStyles as s } from "@/features/events/eventStyles";
import { formatPrecio, type EventItem, type EventPhase } from "@/features/events/types";

import { listSellableEvents, listSellablePhases } from "./api";
import { METODOS_PAGO, METODO_LABEL, type MetodoPago, type NewSaleInput } from "./types";

type Props = {
  busy: boolean;
  serverError: string | null;
  onSubmit: (input: NewSaleInput) => void;
};

export function SaleForm({ busy, serverError, onSubmit }: Props) {
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
    listSellableEvents()
      .then(setEvents)
      .catch((e) => setFormError((e as Error).message))
      .finally(() => setLoadingEvents(false));
  }, []);

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
        <ActivityIndicator color={C22.wine} />
      ) : events.length === 0 ? (
        <Text style={s.meta}>No hay eventos publicados por ahora.</Text>
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
                  selected && { backgroundColor: C22.wine, borderColor: C22.wine },
                  { opacity: pressed || busy ? 0.7 : 1 },
                ]}>
                <Text style={[s.secondaryButtonText, selected && { color: C22.cream }]}>
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
            <ActivityIndicator color={C22.wine} />
          ) : phases.length === 0 ? (
            <Text style={s.meta}>Este evento no tiene fases disponibles.</Text>
          ) : (
            <View style={{ gap: 8 }}>
              {phases.map((ph) => {
                const selected = ph.id === phaseId;
                return (
                  <Pressable
                    key={ph.id}
                    disabled={busy}
                    onPress={() => setPhaseId(ph.id)}
                    style={({ pressed }) => [
                      s.secondaryButton,
                      selected && { backgroundColor: C22.wine, borderColor: C22.wine },
                      { opacity: pressed || busy ? 0.7 : 1 },
                    ]}>
                    <Text style={[s.secondaryButtonText, selected && { color: C22.cream }]}>
                      {ph.nombre} — {formatPrecio(ph.precio)}
                    </Text>
                  </Pressable>
                );
              })}
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
        placeholderTextColor={C22.inkSoft}
        editable={!busy}
        style={s.input}
      />

      <Text style={s.label}>Teléfono (opcional)</Text>
      <TextInput
        value={telefono}
        onChangeText={setTelefono}
        placeholder="55 1234 5678"
        placeholderTextColor={C22.inkSoft}
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
                selected && { backgroundColor: C22.wine, borderColor: C22.wine },
                { opacity: pressed || busy ? 0.7 : 1 },
              ]}>
              <Text style={[s.secondaryButtonText, selected && { color: C22.cream }]}>
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
          <ActivityIndicator color={C22.cream} />
        ) : (
          <Text style={s.primaryButtonText}>Registrar venta</Text>
        )}
      </Pressable>
    </View>
  );
}
