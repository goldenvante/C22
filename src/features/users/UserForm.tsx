import { useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";

import { C22 } from "@/constants/theme";
import { eventStyles as s } from "@/features/events/eventStyles";

import { ROL_LABEL, STAFF_ROLES, type CreateStaffInput, type StaffRole } from "./api";

// Sin 0/O/1/l/I para evitar confusiones visuales.
const TEMP_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

// NOTA: el Hermes de este runtime no expone crypto.getRandomValues en nativo
// y no hay expo-crypto instalado (restricción: sin dependencias nuevas).
// PRNG local que mezcla toda la entropía disponible: Math.random (varias
// tomas), reloj de alta resolución, fecha y estado encadenado entre llamadas.
// Adecuado para temporales de un solo uso con cambio forzado en primer login.
// Para CSPRNG del sistema, instalar expo-crypto y usar getRandomBytes.
let chainState = 0;

function hashSeed(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function nextWord(): number {
  chainState = (chainState + 1) >>> 0;
  const hiRes =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now().toString()
      : "";
  const seed = `${Date.now()}:${hiRes}:${Math.random()}:${Math.random()}:${chainState}`;
  return hashSeed(seed);
}

/** Temporal de 12 caracteres (~70 bits). Nunca lanza: siempre genera. */
function generateTempPassword(len = 12): string {
  const base = TEMP_ALPHABET.length; // 57; 57^4 < 2^32: 4 índices por palabra.
  let out = "";
  while (out.length < len) {
    let word = nextWord();
    for (let k = 0; k < 4 && out.length < len; k++) {
      out += TEMP_ALPHABET[word % base];
      word = Math.floor(word / base);
    }
  }
  return out;
}

type Props = {
  busy: boolean;
  serverError: string | null;
  onSubmit: (input: CreateStaffInput) => void;
};

export function UserForm({ busy, serverError, onSubmit }: Props) {
  const [nombre, setNombre] = useState("");
  const [usuario, setUsuario] = useState("");
  const [rol, setRol] = useState<StaffRole>("seller");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function handleGenerate() {
    setPassword(generateTempPassword());
    setFormError(null);
  }

  function handleSubmit() {
    const input: CreateStaffInput = {
      nombre: nombre.trim(),
      usuario: usuario.trim().toLowerCase(),
      password,
      rol, // Solo seller|access: el selector no ofrece admin.
    };
    if (input.nombre.length < 1 || input.nombre.length > 120) {
      setFormError("El nombre es obligatorio (máx. 120 caracteres).");
      return;
    }
    if (!/^[a-z0-9._-]{3,32}$/.test(input.usuario)) {
      setFormError("Usuario inválido: 3-32 caracteres, letras minúsculas, números, punto, guion o guion bajo.");
      return;
    }
    if (input.password.length < 8) {
      setFormError("La contraseña temporal debe tener al menos 8 caracteres.");
      return;
    }
    setFormError(null);
    onSubmit(input);
  }

  const message = formError ?? serverError;

  return (
    <View style={{ gap: 4 }}>
      <Text style={s.label}>Nombre</Text>
      <TextInput
        value={nombre}
        onChangeText={setNombre}
        placeholder="María Vendedora"
        placeholderTextColor={C22.inkSoft}
        editable={!busy}
        style={s.input}
      />

      <Text style={s.label}>Usuario</Text>
      <TextInput
        value={usuario}
        onChangeText={(v) => setUsuario(v.toLowerCase())}
        placeholder="vendedor1"
        placeholderTextColor={C22.inkSoft}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!busy}
        style={s.input}
      />

      <Text style={s.label}>Rol</Text>
      <View style={s.row}>
        {STAFF_ROLES.map((r) => {
          const selected = rol === r;
          return (
            <Pressable
              key={r}
              disabled={busy}
              onPress={() => setRol(r)}
              style={({ pressed }) => [
                s.secondaryButton,
                selected && { backgroundColor: C22.wine, borderColor: C22.wine },
                { opacity: pressed || busy ? 0.7 : 1 },
              ]}>
              <Text style={[s.secondaryButtonText, selected && { color: C22.cream }]}>
                {ROL_LABEL[r]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={s.label}>Contraseña temporal</Text>
      <TextInput
        value={password}
        onChangeText={setPassword}
        placeholder="Mínimo 8 caracteres"
        placeholderTextColor={C22.inkSoft}
        secureTextEntry={!showPassword}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!busy}
        style={s.input}
      />
      <View style={s.row}>
        <Pressable
          disabled={busy}
          onPress={handleGenerate}
          style={({ pressed }) => [s.secondaryButton, { opacity: pressed || busy ? 0.7 : 1 }]}>
          <Text style={s.secondaryButtonText}>Generar contraseña</Text>
        </Pressable>
        <Pressable disabled={busy} onPress={() => setShowPassword((v) => !v)}>
          <Text style={s.link}>{showPassword ? "Ocultar" : "Mostrar"}</Text>
        </Pressable>
      </View>

      {message ? <Text style={s.error}>{message}</Text> : null}

      <Pressable
        onPress={handleSubmit}
        disabled={busy}
        style={({ pressed }) => [s.primaryButton, { opacity: busy || pressed ? 0.7 : 1 }]}>
        {busy ? (
          <ActivityIndicator color={C22.cream} />
        ) : (
          <Text style={s.primaryButtonText}>Crear usuario</Text>
        )}
      </Pressable>
    </View>
  );
}
