import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/auth/AuthProvider";
import { useEventStyles } from "@/features/events/eventStyles";
import { supabase } from "@/lib/supabase";

const MIN_LEN = 8;

function friendlyUpdateError(message: string): string {
  if (/same|different|actual|actualizar/i.test(message) && /password|contraseña/i.test(message)) {
    return "La nueva contraseña debe ser diferente a la temporal.";
  }
  if (/weak|short|length|caracter/i.test(message)) {
    return `La contraseña debe tener al menos ${MIN_LEN} caracteres.`;
  }
  if (/network|fetch|failed/i.test(message)) {
    return "Sin conexión. Revisa tu internet e inténtalo de nuevo.";
  }
  if (/expired|invalid.*token|session|sesión/i.test(message)) {
    return "Tu sesión expiró. Cierra sesión e inicia de nuevo.";
  }
  return "No se pudo guardar la contraseña. Inténtalo de nuevo.";
}

/**
 * Cambio obligatorio de contraseña temporal. Sin salidas salvo cerrar sesión:
 * RouteGate mantiene al usuario aquí hasta que el flag quede limpio.
 */
export default function CambiarPasswordScreen() {
  const { s, p } = useEventStyles();
  const { session, signOut } = useAuth();
  const [nueva, setNueva] = useState("");
  const [repite, setRepite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setError(null);
    if (!session) return; // Sin sesión, el gate lleva al login.
    if (nueva.length < MIN_LEN) {
      setError(`La contraseña debe tener al menos ${MIN_LEN} caracteres.`);
      return;
    }
    if (nueva !== repite) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    // La temporal no se conoce localmente: no se inventa esa comprobación.
    // Si Supabase la rechaza por igual, se mapea el error arriba.
    setBusy(true);
    try {
      const { error: passError } = await supabase.auth.updateUser({ password: nueva });
      if (passError) {
        setError(friendlyUpdateError(passError.message));
        return;
      }
      const { error: metaError } = await supabase.auth.updateUser({
        data: { debe_cambiar_password: false },
      });
      if (metaError) {
        setError(friendlyUpdateError(metaError.message));
        return;
      }
      const { data, error: getError } = await supabase.auth.getUser();
      if (getError || data.user?.user_metadata?.debe_cambiar_password === true) {
        setError("No se pudo confirmar el cambio. Inténtalo de nuevo.");
        return;
      }
      // Flag limpio: requiresPasswordChange se apaga solo y RouteGate redirige.
      setNueva("");
      setRepite("");
    } catch {
      setError("Sin conexión. Revisa tu internet e inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  if (!session) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={p.primary} />
      </View>
    );
  }

  return (
    <View style={s.screen}>
      <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={[s.scroll, { flex: 1, justifyContent: "center" }]}>
          <Text style={s.screenTitle}>Crea tu nueva contraseña</Text>
          <View style={s.goldRule} />
          <Text style={s.meta}>
            Usas una contraseña temporal. Cámbiala ahora para continuar a tu inicio.
          </Text>

          <Text style={s.label}>Nueva contraseña</Text>
          <TextInput
            value={nueva}
            onChangeText={setNueva}
            placeholder={`Mínimo ${MIN_LEN} caracteres`}
            placeholderTextColor={p.textSoft}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
            style={s.input}
          />

          <Text style={s.label}>Repite tu nueva contraseña</Text>
          <TextInput
            value={repite}
            onChangeText={setRepite}
            placeholder="Repite la contraseña"
            placeholderTextColor={p.textSoft}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
            onSubmitEditing={onSubmit}
            style={s.input}
          />

          {error ? <Text style={s.error}>{error}</Text> : null}

          <Pressable
            onPress={onSubmit}
            disabled={busy}
            style={({ pressed }) => [s.primaryButton, { opacity: busy || pressed ? 0.7 : 1 }]}>
            {busy ? (
              <ActivityIndicator color={p.onPrimary} />
            ) : (
              <Text style={s.primaryButtonText}>Guardar nueva contraseña</Text>
            )}
          </Pressable>

          <Pressable onPress={signOut} disabled={busy} style={s.linkWrap}>
            <Text style={s.link}>Cerrar sesión</Text>
          </Pressable>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
