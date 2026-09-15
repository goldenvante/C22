import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";

import { C22 } from "@/constants/theme";

import { createPhase, listPhases } from "./api";
import { eventStyles as s } from "./eventStyles";
import {
  formatFecha,
  formatPrecio,
  toFechaKey,
  type EventPhase,
} from "./types";

type PickerTarget = { campo: "inicio" | "fin" } | null;

function FechaButton({
  label,
  value,
  onPress,
  disabled,
}: {
  label: string;
  value: Date | null;
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <View style={{ gap: 2 }}>
      <Text style={s.label}>{label}</Text>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => [s.input, { opacity: pressed || disabled ? 0.7 : 1 }]}>
        {value ? (
          <Text style={s.fieldText}>{formatFecha(toFechaKey(value))}</Text>
        ) : (
          <Text style={s.fieldPlaceholder}>Seleccionar…</Text>
        )}
      </Pressable>
    </View>
  );
}

export function PhaseManager({ eventId }: { eventId: string }) {
  const [phases, setPhases] = useState<EventPhase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nombre, setNombre] = useState("");
  const [precio, setPrecio] = useState("");
  const [inicioCre, setInicioCre] = useState<Date | null>(null);
  const [finCre, setFinCre] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState<PickerTarget>(null);
  const [modalDate, setModalDate] = useState<Date>(new Date());

  async function reload() {
    try {
      setPhases(await listPhases(eventId));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  function parsePrecio(raw: string): number | null {
    const n = Number(raw.replace(",", "."));
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.round(n * 100) / 100;
  }

  /** Valida el rango. Devuelve las claves YYYY-MM-DD o null con error seteado. */
  function validateRango(
    inicio: Date | null,
    fin: Date | null,
  ): { inicioKey: string; finKey: string } | null {
    if (!inicio) {
      setError("Selecciona la fecha de inicio.");
      return null;
    }
    if (!fin) {
      setError("Selecciona la fecha de fin.");
      return null;
    }
    const inicioKey = toFechaKey(inicio);
    const finKey = toFechaKey(fin);
    if (finKey < inicioKey) {
      setError("La fecha de fin no puede ser anterior a la fecha de inicio.");
      return null;
    }
    return { inicioKey, finKey };
  }

  /** Abre el selector de la nueva fase. En iOS se muestra en un modal. */
  function openPicker(campo: "inicio" | "fin") {
    const current = campo === "inicio" ? inicioCre : finCre;
    setModalDate(current ?? new Date());
    setPicker({ campo });
  }

  function commitModalDate() {
    if (!picker) return;
    if (picker.campo === "inicio") setInicioCre(modalDate);
    else setFinCre(modalDate);
    setPicker(null);
  }

  function handlePickerChange(event: DateTimePickerEvent, selected?: Date) {
    if (event.type === "dismissed" || !picker) {
      setPicker(null);
      return;
    }
    if (Platform.OS === "ios") {
      // En el modal de iOS solo se previsualiza; se confirma con Aceptar.
      if (selected) setModalDate(selected);
      return;
    }
    // En Android el diálogo del sistema confirma solo: se guarda directo.
    if (selected) {
      if (picker.campo === "inicio") setInicioCre(selected);
      else setFinCre(selected);
    }
    setPicker(null);
  }

  function pickerValue(): Date {
    if (!picker) return new Date();
    const current = picker.campo === "inicio" ? inicioCre : finCre;
    return current ?? new Date();
  }

  async function handleAdd() {
    const name = nombre.trim();
    const price = parsePrecio(precio.trim());
    if (!name) {
      setError("La fase necesita un nombre (p. ej. Preventa).");
      return;
    }
    if (price === null) {
      setError("Precio inválido. Usa un número mayor o igual a 0.");
      return;
    }
    const rango = validateRango(inicioCre, finCre);
    if (!rango) return;
    setBusy(true);
    setError(null);
    try {
      await createPhase(eventId, {
        nombre: name,
        precio: price,
        fecha_inicio: rango.inicioKey,
        fecha_fin: rango.finKey,
      });
      setNombre("");
      setPrecio("");
      setInicioCre(null);
      setFinCre(null);
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function vigenciaLabel(phase: EventPhase): string {
    if (phase.fecha_inicio && phase.fecha_fin) {
      return `${formatFecha(phase.fecha_inicio)} – ${formatFecha(phase.fecha_fin)}`;
    }
    return "Sin vigencia definida";
  }

  if (loading) return <ActivityIndicator color={C22.wine} />;

  return (
    <View style={{ gap: 8 }}>
      {error ? <Text style={s.error}>{error}</Text> : null}

      {phases.length === 0 ? (
        <Text style={s.meta}>Sin fases todavía. Agrega la primera (p. ej. Preventa).</Text>
      ) : null}

      {phases.map((phase) => (
        <View key={phase.id} style={s.card}>
          <View style={{ gap: 2 }}>
            <View style={s.row}>
              <Text style={[s.smallBold, { flex: 1 }]}>
                {phase.orden}. {phase.nombre} — {formatPrecio(phase.precio)}
              </Text>
              <Text style={phase.activa ? s.faseOn : s.faseOff}>
                {phase.activa ? "Activa" : "Inactiva"}
              </Text>
            </View>
            <Text style={s.meta}>{vigenciaLabel(phase)}</Text>
            <Text style={s.meta}>Las fases no se pueden modificar una vez creadas.</Text>
          </View>
        </View>
      ))}

      <View style={s.card}>
        <Text style={s.sectionTitle}>Nueva fase</Text>
        <TextInput
          value={nombre}
          onChangeText={setNombre}
          placeholder="Preventa"
          placeholderTextColor={C22.inkSoft}
          editable={!busy}
          style={s.input}
        />
        <TextInput
          value={precio}
          onChangeText={setPrecio}
          placeholder="150.00"
          placeholderTextColor={C22.inkSoft}
          keyboardType="decimal-pad"
          editable={!busy}
          style={s.input}
        />
        <FechaButton
          label="Fecha de inicio"
          value={inicioCre}
          disabled={busy}
          onPress={() => openPicker("inicio")}
        />
        <FechaButton
          label="Fecha de fin"
          value={finCre}
          disabled={busy}
          onPress={() => openPicker("fin")}
        />
        <Pressable
          onPress={handleAdd}
          disabled={busy}
          style={({ pressed }) => [s.primaryButton, { opacity: busy || pressed ? 0.7 : 1 }]}>
          {busy ? (
            <ActivityIndicator color={C22.cream} />
          ) : (
            <Text style={s.primaryButtonText}>Agregar fase</Text>
          )}
        </Pressable>
      </View>

      {picker && Platform.OS === "android" ? (
        <DateTimePicker
          value={pickerValue()}
          mode="date"
          display="default"
          onChange={handlePickerChange}
        />
      ) : null}

      <Modal
        visible={picker !== null && Platform.OS === "ios"}
        transparent
        animationType="fade"
        onRequestClose={() => setPicker(null)}>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <DateTimePicker
              value={modalDate}
              mode="date"
              display="inline"
              locale="es-ES"
              themeVariant="light"
              onChange={handlePickerChange}
            />
            <View style={s.row}>
              <Pressable
                onPress={() => setPicker(null)}
                style={({ pressed }) => [s.secondaryButton, { opacity: pressed ? 0.7 : 1 }]}>
                <Text style={s.secondaryButtonText}>Cancelar</Text>
              </Pressable>
              <Pressable
                onPress={commitModalDate}
                style={({ pressed }) => [s.primaryButton, { flex: 1, marginTop: 0, opacity: pressed ? 0.7 : 1 }]}>
                <Text style={s.primaryButtonText}>Aceptar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
