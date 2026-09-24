import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { useAuth } from "@/auth/AuthProvider";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { MaxContentWidth, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { loginEmailForUsuario, supabase } from "@/lib/supabase";

function friendlyAuthError(message: string): string {
  if (/invalid login credentials/i.test(message)) {
    return "Usuario o contraseña incorrectos.";
  }
  if (/email not confirmed/i.test(message)) {
    return "Tu cuenta aún no está confirmada. Contacta al administrador.";
  }
  if (/too many requests|rate limit/i.test(message)) {
    return "Demasiados intentos. Espera un momento e inténtalo de nuevo.";
  }
  if (/network|fetch|failed/i.test(message)) {
    return "Sin conexión. Revisa tu internet e inténtalo de nuevo.";
  }
  return "No se pudo iniciar sesión. Inténtalo de nuevo.";
}

export default function LoginScreen() {
  const theme = useTheme();
  const { session, profile, loading: authLoading, notice, clearNotice, signOut, requiresPasswordChange } = useAuth();
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    clearNotice();
    setError(null);
    const u = usuario.trim().toLowerCase();
    if (!u || !password) {
      setError("Escribe tu usuario y tu contraseña.");
      return;
    }
    if (!/^[a-z0-9._-]{1,32}$/.test(u)) {
      setError("Usuario inválido. Usa letras, números, punto, guion o guion bajo.");
      return;
    }
    setBusy(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: loginEmailForUsuario(u),
        password,
      });
      if (signInError) setError(friendlyAuthError(signInError.message));
      // Si es válido, el RouteGate redirige según el rol. No navegar aquí.
    } catch {
      setError("Sin conexión. Revisa tu internet e inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  // Con cambio obligatorio pendiente, el gate mueve a /cambiar-password:
  // loader aquí también para no mostrar el formulario ni el enlace de salida.
  if (authLoading || (session && (profile || requiresPasswordChange))) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  const message = error ?? notice;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.form}>
          <ThemedText type="title" style={styles.title}>
            Gestión de eventos
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.subtitle}>
            Inicia sesión con tu usuario
          </ThemedText>

          <ThemedText type="smallBold">Usuario</ThemedText>
          <TextInput
            value={usuario}
            onChangeText={setUsuario}
            placeholder="p. ej. admin.sanjuan"
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
            onSubmitEditing={onSubmit}
            style={[
              styles.input,
              { color: theme.text, borderColor: theme.textSecondary, backgroundColor: theme.backgroundElement },
            ]}
          />

          <ThemedText type="smallBold">Contraseña</ThemedText>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Tu contraseña"
            placeholderTextColor={theme.textSecondary}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
            onSubmitEditing={onSubmit}
            style={[
              styles.input,
              { color: theme.text, borderColor: theme.textSecondary, backgroundColor: theme.backgroundElement },
            ]}
          />

          {message ? (
            <ThemedText type="small" style={styles.error}>
              {message}
            </ThemedText>
          ) : null}

          <Pressable
            onPress={onSubmit}
            disabled={busy}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: theme.text, opacity: busy || pressed ? 0.7 : 1 },
            ]}>
            {busy ? (
              <ActivityIndicator color={theme.background} />
            ) : (
              <ThemedText type="smallBold" style={{ color: theme.background }}>
                Iniciar sesión
              </ThemedText>
            )}
          </Pressable>

          {session && !profile && !requiresPasswordChange ? (
            <Pressable onPress={signOut} style={styles.linkButton}>
              <ThemedText type="link">Usar otra cuenta</ThemedText>
            </Pressable>
          ) : null}

          {!session ? (
            <Pressable onPress={() => router.push("/setup")} style={styles.linkButton}>
              <ThemedText type="link">¿Nuevo comité? Regístralo aquí</ThemedText>
            </Pressable>
          ) : null}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  container: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
  },
  safeArea: {
    flex: 1,
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    justifyContent: "center",
  },
  form: {
    gap: Spacing.two,
  },
  title: {
    textAlign: "center",
  },
  subtitle: {
    textAlign: "center",
    marginBottom: Spacing.three,
  },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  error: {
    color: "#D64545",
  },
  button: {
    marginTop: Spacing.two,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: "center",
  },
  linkButton: {
    alignItems: "center",
    paddingVertical: Spacing.two,
  },
});
