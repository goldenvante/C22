import { useState, useEffect } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { useAuth } from "@/auth/AuthProvider";
import { adminLogin, loginIsAdmin } from "@/features/auth/adminAuth";
import { MaxContentWidth, Spacing, Type } from "@/constants/theme";
import { useEventStyles } from "@/features/events/eventStyles";
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
  const { s, p } = useEventStyles();
  const { session, profile, loading: authLoading, notice, clearNotice, signOut, requiresPasswordChange } = useAuth();
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [isAdminAccount, setIsAdminAccount] = useState<boolean | null>(null);

  useEffect(() => {
    if (session) {
      setIsAdminAccount(null);
      return;
    }
    const u = usuario.trim().toLowerCase();
    if (!u) {
      setIsAdminAccount(null);
      return;
    }
    let alive = true;
    const timer = setTimeout(() => {
      loginIsAdmin(u)
        .then((value) => {
          if (alive) setIsAdminAccount(value);
        })
        .catch(() => {
          if (alive) setIsAdminAccount(false);
        });
    }, 400);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [usuario, session]);

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
      const adminAccount = isAdminAccount === null ? await loginIsAdmin(u) : isAdminAccount;
      if (adminAccount) {
        await adminLogin(u, password);
        return;
      }
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: loginEmailForUsuario(u),
        password,
      });
      if (!signInError) return;
      if (
        /invalid login credentials/i.test(signInError.message) &&
        (await loginIsAdmin(u).catch(() => false))
      ) {
        await adminLogin(u, password);
        return;
      }
      setError(friendlyAuthError(signInError.message));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sin conexión. Revisa tu internet e inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  // Con cambio obligatorio pendiente, el gate mueve a /cambiar-password:
  // loader aquí también para no mostrar el formulario ni el enlace de salida.
  if (authLoading || (session && (profile || requiresPasswordChange))) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={p.primary} />
      </View>
    );
  }

  const message = error ?? notice;

  return (
    <View style={s.screen}>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1 }}>
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            <View style={styles.content}>
              {/* Marca del producto */}
              <View style={styles.brand}>
                <Text style={[styles.wordmark, { color: p.title }]}>MONARQ</Text>
                <View style={s.goldRule} />
                <Text style={s.meta}>Gestión de eventos, boletos y accesos</Text>
              </View>

              <View style={[s.card, styles.card]}>
                <Text style={s.sectionTitle}>Inicia sesión</Text>
                <Text style={s.meta}>Ingresa con tu usuario</Text>

                <Text style={s.label}>Usuario</Text>
                <TextInput
                  value={usuario}
                  onChangeText={setUsuario}
                  placeholder="Tu usuario"
                  placeholderTextColor={p.textSoft}
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!busy}
                  onSubmitEditing={onSubmit}
                  style={s.input}
                />

                <Text style={s.label}>Contraseña</Text>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Tu contraseña"
                  placeholderTextColor={p.textSoft}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!busy}
                  onSubmitEditing={onSubmit}
                  style={s.input}
                />

                {message ? <Text style={s.error}>{message}</Text> : null}

                <Pressable
                  onPress={onSubmit}
                  disabled={busy}
                  style={({ pressed }) => [
                    s.primaryButton,
                    { opacity: busy || pressed ? 0.7 : 1 },
                  ]}>
                  {busy ? (
                    <ActivityIndicator color={p.onPrimary} />
                  ) : (
                    <Text style={s.primaryButtonText}>Iniciar sesión</Text>
                  )}
                </Pressable>

                {!session && isAdminAccount ? (
                  <Pressable
                    onPress={() => router.push("/reset-password")}
                    style={({ pressed }) => [s.linkWrap, { opacity: pressed ? 0.7 : 1 }]}>
                    <Text style={s.link}>¿Olvidaste tu contraseña?</Text>
                  </Pressable>
                ) : null}

                {session && !profile && !requiresPasswordChange ? (
                  <Pressable onPress={signOut} style={({ pressed }) => [s.linkWrap, { opacity: pressed ? 0.7 : 1 }]}>
                    <Text style={s.link}>Usar otra cuenta</Text>
                  </Pressable>
                ) : null}

                {!session ? (
                  <Pressable onPress={() => router.push("/setup")} style={({ pressed }) => [s.linkWrap, { opacity: pressed ? 0.7 : 1 }]}>
                    <Text style={s.link}>¿Nuevo comité? Regístralo aquí</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.three,
  },
  content: {
    width: "100%",
    maxWidth: MaxContentWidth,
    gap: Spacing.four,
  },
  brand: {
    alignItems: "center",
    gap: Spacing.two,
  },
  wordmark: {
    fontSize: 34,
    fontFamily: Type.display,
    letterSpacing: 6,
    textAlign: "center",
  },
  card: {
    gap: Spacing.three,
    padding: Spacing.four,
    borderRadius: 16,
  },
});
