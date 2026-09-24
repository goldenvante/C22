import { useState } from "react";
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
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";

import { suggestCode } from "./codigo";
import { useEventStyles } from "./eventStyles";
import { formatFecha, parseFechaLocal, toFechaKey } from "./types";

export type EventFormValues = {
  nombre: string;
  codigo: string;
  fecha: string; // YYYY-MM-DD
  hora: string; // HH:MM o ""
  lugar: string;
  mapas_url: string; // URL de Google/Apple Maps pegada (opcional)
  imagen_url: string; // URL remota existente o "" (nunca una ruta local)
};

type Props = {
  initial?: Partial<EventFormValues>;
  submitLabel: string;
  busy: boolean;
  serverError: string | null;
  onSubmit: (values: EventFormValues, pendingImage: PendingEventImage) => void;
};

/** Imagen recién elegida pendiente de subir (URI file:// + mimeType del asset). */
export type PendingEventImage = {
  localUri: string;
  mimeType: string | null;
} | null;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toHoraKey(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseHoraLocal(hora: string): Date | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/.exec(hora.trim());
  if (!m) return null;
  const d = new Date();
  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  return d;
}

export function EventForm({ initial, submitLabel, busy, serverError, onSubmit }: Props) {
  const { s, p } = useEventStyles();
  const [nombre, setNombre] = useState(initial?.nombre ?? "");
  const [codigo, setCodigo] = useState(initial?.codigo ?? "");
  const [codigoTouched, setCodigoTouched] = useState(Boolean(initial?.codigo));
  const [fechaKey, setFechaKey] = useState(initial?.fecha ?? "");
  const [horaStr, setHoraStr] = useState((initial?.hora ?? "").slice(0, 5));
  const [lugar, setLugar] = useState(initial?.lugar ?? "");
  const [mapasUrl, setMapasUrl] = useState(initial?.mapas_url ?? "");
  const [formError, setFormError] = useState<string | null>(null);

  // Selector de fecha (mismo patrón que PhaseManager).
  const [dateOpen, setDateOpen] = useState(false);
  const [modalDate, setModalDate] = useState<Date>(new Date());
  // Selector de hora (opcional).
  const [timeOpen, setTimeOpen] = useState(false);
  const [modalTime, setModalTime] = useState<Date>(new Date());

  // Imagen: remota existente (initial), recién elegida (preview+subida) o quitada.
  const initialRemote = initial?.imagen_url ?? "";
  const [pendingImage, setPendingImage] = useState<PendingEventImage>(null);
  const [removed, setRemoved] = useState(false);
  const displayUri = pendingImage?.localUri ?? (removed ? null : initialRemote || null);

  function handleNombreChange(value: string) {
    setNombre(value);
    if (!codigoTouched) setCodigo(suggestCode(value));
  }

  function openDatePicker() {
    setModalDate(parseFechaLocal(fechaKey) ?? new Date());
    setDateOpen(true);
  }

  function handleDateChange(event: DateTimePickerEvent, selected?: Date) {
    if (event.type === "dismissed") {
      setDateOpen(false);
      return;
    }
    if (Platform.OS === "ios") {
      if (selected) setModalDate(selected);
      return;
    }
    if (selected) setFechaKey(toFechaKey(selected));
    setDateOpen(false);
  }

  function openTimePicker() {
    setModalTime(parseHoraLocal(horaStr) ?? new Date());
    setTimeOpen(true);
  }

  function handleTimeChange(event: DateTimePickerEvent, selected?: Date) {
    if (event.type === "dismissed") {
      setTimeOpen(false);
      return;
    }
    if (Platform.OS === "ios") {
      if (selected) setModalTime(selected);
      return;
    }
    if (selected) setHoraStr(toHoraKey(selected));
    setTimeOpen(false);
  }

  async function pickImage() {
    setFormError(null);
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.8,
      });
      if (!res.canceled && res.assets?.[0]?.uri) {
        setPendingImage({ localUri: res.assets[0].uri, mimeType: res.assets[0].mimeType ?? null });
        setRemoved(false);
      }
    } catch {
      setFormError("No se pudo abrir la fototeca. Inténtalo de nuevo.");
    }
  }

  function handleSubmit() {
    const v: EventFormValues = {
      nombre: nombre.trim(),
      codigo: codigo.trim().toUpperCase(),
      fecha: fechaKey.trim(),
      hora: horaStr.trim(),
      lugar: lugar.trim(),
      mapas_url: mapasUrl.trim(),
      // Nunca una ruta local: solo la remota existente o vacío.
      imagen_url: removed ? "" : initialRemote,
    };
    if (v.nombre.length < 1 || v.nombre.length > 160) {
      setFormError("El nombre es obligatorio (máx. 160 caracteres).");
      return;
    }
    if (v.codigo.length < 2 || v.codigo.length > 24) {
      setFormError("El código debe tener entre 2 y 24 caracteres.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v.fecha) || !parseFechaLocal(v.fecha)) {
      setFormError("Selecciona la fecha del evento.");
      return;
    }
    if (v.hora && !/^([01]\d|2[0-3]):[0-5]\d$/.test(v.hora)) {
      setFormError("La hora debe tener formato HH:MM de 24 h o quedar vacía.");
      return;
    }
    if (v.mapas_url && !/^https?:\/\/.+/i.test(v.mapas_url)) {
      setFormError("La URL de Maps debe empezar con http(s):// o quedar vacía.");
      return;
    }
    setFormError(null);
    // pendingImage viaja aparte: la pantalla receptora la sube a Storage y
    // guarda la URL pública. Aquí nunca se envía una ruta local como imagen_url.
    onSubmit(v, pendingImage);
  }

  const message = formError ?? serverError;

  return (
    <View style={{ gap: 4 }}>
      <Text style={s.label}>Nombre</Text>
      <TextInput
        value={nombre}
        onChangeText={handleNombreChange}
        placeholder="Gran Baile Anual"
        placeholderTextColor={p.textSoft}
        editable={!busy}
        style={s.input}
      />

      <Text style={s.label}>Código corto</Text>
      <View style={s.row}>
        <TextInput
          value={codigo}
          onChangeText={(v) => {
            setCodigo(v.toUpperCase());
            setCodigoTouched(true);
          }}
          placeholder="GBA-2026"
          placeholderTextColor={p.textSoft}
          autoCapitalize="characters"
          autoCorrect={false}
          editable={!busy}
          style={[s.input, { flex: 1 }]}
        />
        <Pressable
          disabled={busy}
          onPress={() => setCodigo(suggestCode(nombre))}
          style={({ pressed }) => [s.secondaryButton, { opacity: pressed || busy ? 0.7 : 1 }]}>
          <Text style={s.secondaryButtonText}>Sugerir</Text>
        </Pressable>
      </View>

      <Text style={s.label}>Fecha del evento</Text>
      <Pressable
        onPress={openDatePicker}
        disabled={busy}
        style={({ pressed }) => [s.input, { opacity: pressed || busy ? 0.7 : 1 }]}>
        {fechaKey ? (
          <Text style={s.fieldText}>{formatFecha(fechaKey)}</Text>
        ) : (
          <Text style={s.fieldPlaceholder}>Seleccionar…</Text>
        )}
      </Pressable>

      <Text style={s.label}>Hora del evento (opcional)</Text>
      <Pressable
        onPress={openTimePicker}
        disabled={busy}
        style={({ pressed }) => [s.input, { opacity: pressed || busy ? 0.7 : 1 }]}>
        {horaStr ? (
          <Text style={s.fieldText}>{horaStr}</Text>
        ) : (
          <Text style={s.fieldPlaceholder}>Seleccionar…</Text>
        )}
      </Pressable>
      {horaStr ? (
        <Pressable disabled={busy} onPress={() => setHoraStr("")}>
          <Text style={s.dangerLink}>Quitar hora</Text>
        </Pressable>
      ) : null}

      <Text style={s.label}>Lugar</Text>
      <TextInput
        value={lugar}
        onChangeText={setLugar}
        placeholder="Patio central"
        placeholderTextColor={p.textSoft}
        editable={!busy}
        style={s.input}
      />

      <Text style={s.label}>URL de Maps (opcional)</Text>
      <TextInput
        value={mapasUrl}
        onChangeText={setMapasUrl}
        placeholder="https://maps.google.com/… o https://maps.apple.com/…"
        placeholderTextColor={p.textSoft}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!busy}
        style={s.input}
      />

      <Text style={s.label}>Imagen del evento (opcional)</Text>
      {displayUri ? (
        <View style={{ gap: 8 }}>
          <Image
            source={{ uri: displayUri }}
            contentFit="cover"
            style={{ width: "100%", aspectRatio: 16 / 9, borderRadius: 8, borderWidth: 1, borderColor: p.primary }}
          />
          <View style={s.row}>
            <Pressable
              disabled={busy}
              onPress={pickImage}
              style={({ pressed }) => [s.secondaryButton, { opacity: pressed || busy ? 0.7 : 1 }]}>
              <Text style={s.secondaryButtonText}>Reemplazar imagen</Text>
            </Pressable>
            <Pressable
              disabled={busy}
              onPress={() => {
                setPendingImage(null);
                setRemoved(true);
              }}>
              <Text style={s.dangerLink}>Quitar imagen</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable
          disabled={busy}
          onPress={pickImage}
          style={({ pressed }) => [s.secondaryButton, { opacity: pressed || busy ? 0.7 : 1 }]}>
          <Text style={s.secondaryButtonText}>Agregar imagen</Text>
        </Pressable>
      )}
      {message ? <Text style={s.error}>{message}</Text> : null}

      <Pressable
        onPress={handleSubmit}
        disabled={busy}
        style={({ pressed }) => [s.primaryButton, { opacity: busy || pressed ? 0.7 : 1 }]}>
        {busy ? (
          <ActivityIndicator color={p.onPrimary} />
        ) : (
          <Text style={s.primaryButtonText}>{submitLabel}</Text>
        )}
      </Pressable>

      {dateOpen && Platform.OS === "android" ? (
        <DateTimePicker value={parseFechaLocal(fechaKey) ?? new Date()} mode="date" display="default" onChange={handleDateChange} />
      ) : null}

      <Modal
        visible={dateOpen && Platform.OS === "ios"}
        transparent
        animationType="fade"
        onRequestClose={() => setDateOpen(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <DateTimePicker
              value={modalDate}
              mode="date"
              display="inline"
              locale="es-ES"
              themeVariant="light"
              onChange={handleDateChange}
            />
            <View style={s.row}>
              <Pressable
                onPress={() => setDateOpen(false)}
                style={({ pressed }) => [s.secondaryButton, { opacity: pressed ? 0.7 : 1 }]}>
                <Text style={s.secondaryButtonText}>Cancelar</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setFechaKey(toFechaKey(modalDate));
                  setDateOpen(false);
                }}
                style={({ pressed }) => [s.primaryButton, { flex: 1, marginTop: 0, opacity: pressed ? 0.7 : 1 }]}>
                <Text style={s.primaryButtonText}>Aceptar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {timeOpen && Platform.OS === "android" ? (
        <DateTimePicker
          value={parseHoraLocal(horaStr) ?? new Date()}
          mode="time"
          display="default"
          onChange={handleTimeChange}
        />
      ) : null}

      <Modal
        visible={timeOpen && Platform.OS === "ios"}
        transparent
        animationType="fade"
        onRequestClose={() => setTimeOpen(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <DateTimePicker
              value={modalTime}
              mode="time"
              display="spinner"
              locale="es-ES"
              themeVariant="light"
              onChange={handleTimeChange}
            />
            <View style={s.row}>
              <Pressable
                onPress={() => setTimeOpen(false)}
                style={({ pressed }) => [s.secondaryButton, { opacity: pressed ? 0.7 : 1 }]}>
                <Text style={s.secondaryButtonText}>Cancelar</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setHoraStr(toHoraKey(modalTime));
                  setTimeOpen(false);
                }}
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
