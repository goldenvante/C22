import { useCallback, useEffect, useState } from "react";
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
import { router } from "expo-router";
import * as Linking from "expo-linking";

import { useEventStyles } from "@/features/events/eventStyles";
import { GENERIC_REQUEST_ERROR, requestRecovery } from "@/features/auth/adminAuth";
import { supabase } from "@/lib/supabase";

const MIN_LEN = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const SENT_MESSAGE = "Revisa tu correo electrónico y sigue el enlace para continuar.";
const DONE_MESSAGE = "Tu contraseña se actualizó correctamente.";
const LINK_ERROR_MESSAGE = GENERIC_REQUEST_ERROR;

type Mode = "request" | "update" | "done";
type PendingToken = { access: string; refresh: string };

function parseLink(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  const hashIndex = raw.indexOf("#");
  const beforeHash = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw;
  const queryIndex = beforeHash.indexOf("?");
  const parts = [queryIndex >= 0 ? beforeHash.slice(queryIndex + 1) : ""];
  if (hashIndex >= 0) parts.push(raw.slice(hashIndex + 1));
  for (const part of parts) {
    if (!part) continue;
    for (const pair of part.split("&")) {
      const eq = pair.indexOf("=");
      if (eq <= 0) continue;
      const key = decodeURIComponent(pair.slice(0, eq));
      if (out[key] !== undefined) continue;
      out[key] = decodeURIComponent(pair.slice(eq + 1).replace(/\+/g, " "));
    }
  }
  return out;
}

function friendlyUpdateError(message: string): string {
  if (/weak|short|length|caracter|password/i.test(message)) {
    return `La contraseña debe tener al menos ${MIN_LEN} caracteres.`;
  }
  if (/network|fetch|failed/i.test(message)) {
    return "Sin conexión. Revisa tu internet e inténtalo de nuevo.";
  }
  if (/expired|invalid|token/i.test(message)) {
    return LINK_ERROR_MESSAGE;
  }
  return "No se pudo guardar la contraseña. Inténtalo de nuevo.";
}

export default function ResetPasswordScreen() {
  const { s, p } = useEventStyles();
  const [mode, setMode] = useState<Mode>("request");
  const [email, setEmail] = useState("");
  const [nueva, setNueva] = useState("");
  const [repite, setRepite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sentMessage, setSentMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingToken, setPendingToken] = useState<PendingToken | null>(null);

  const consume = useCallback((raw: string | null) => {
    if (!raw || raw.indexOf("reset-password") < 0) return;
    const parts = parseLink(raw);
    if (parts.error || parts.error_description) {
      setError(LINK_ERROR_MESSAGE);
      return;
    }
    if (parts.access_token && parts.refresh_token) {
      setError(null);
      setPendingToken({ access: parts.access_token, refresh: parts.refresh_token });
    }
  }, []);

  useEffect(() => {
    let alive = true;
    const handle = (url: string | null) => {
      if (alive) consume(url);
    };
    Linking.getInitialURL().then(handle);
    const sub = Linking.addEventListener("url", (event) => handle(event.url));
    return () => {
      alive = false;
      sub.remove();
    };
  }, [consume]);

  useEffect(() => {
    if (!pendingToken) return;
    let alive = true;
    (async () => {
      setBusy(true);
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: pendingToken.access,
        refresh_token: pendingToken.refresh,
      });
      if (!alive) return;
      setBusy(false);
      if (sessionError) {
        setPendingToken(null);
        setError(LINK_ERROR_MESSAGE);
        return;
      }
      setError(null);
      setPendingToken(null);
      setMode("update");
    })();
    return () => {
      alive = false;
    };
  }, [pendingToken]);

  async function onSend() {
    setError(null);
    setSentMessage(null);
    const clean = email.trim().toLowerCase();
    if (!EMAIL_RE.test(clean)) {
      setError("Escribe un correo electrónico válido.");
      return;
    }
    setBusy(true);
    try {
      const message = await requestRecovery(clean);
      setSentMessage(message);
    } catch (e) {
      setError(e instanceof Error ? e.message : LINK_ERROR_MESSAGE);
    } finally {
      setBusy(false);
    }
  }

  async function onUpdate() {
    setError(null);
    if (nueva.length < MIN_LEN) {
      setError(`La contraseña debe tener al menos ${MIN_LEN} caracteres.`);
      return;
    }
    if (nueva !== repite) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setBusy(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password: nueva });
      if (updateError) {
        setError(friendlyUpdateError(updateError.message));
        return;
      }
      setNueva("");
      setRepite("");
      setMode("done");
    } catch {
      setError("Sin conexión. Revisa tu internet e inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  const goLogin = () => router.replace("/");

  if (busy && pendingToken) {
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
          {mode === "request" ? (
            <>
              <Text style={s.screenTitle}>Recupera tu contraseña</Text>
              <View style={s.goldRule} />
              <Text style={s.meta}>
                Escribe el correo del administrador y te enviaremos un enlace para
                crear una contraseña nueva.
              </Text>

              <Text style={s.label}>Correo electrónico</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="admin@ejemplo.com"
                placeholderTextColor={p.textSoft}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!busy}
                onSubmitEditing={onSend}
                style={s.input}
              />

              {error ? <Text style={s.error}>{error}</Text> : null}
              {sentMessage ? (
                <Text style={s.meta}>
                  {sentMessage}
                  {"\n"}
                  {SENT_MESSAGE}
                </Text>
              ) : null}

              <Pressable
                onPress={onSend}
                disabled={busy}
                style={({ pressed }) => [
                  s.primaryButton,
                  { opacity: busy || pressed ? 0.7 : 1 },
                ]}>
                {busy ? (
                  <ActivityIndicator color={p.onPrimary} />
                ) : (
                  <Text style={s.primaryButtonText}>Enviar enlace</Text>
                )}
              </Pressable>

              <Pressable onPress={goLogin} style={({ pressed }) => [s.linkWrap, { opacity: pressed ? 0.7 : 1 }]}>
                <Text style={s.link}>Volver al inicio de sesión</Text>
              </Pressable>
            </>
          ) : null}

          {mode === "update" ? (
            <>
              <Text style={s.screenTitle}>Crea tu nueva contraseña</Text>
              <View style={s.goldRule} />
              <Text style={s.meta}>
                Usa al menos {MIN_LEN} caracteres. Podrás volver a entrar con la
                nueva contraseña.
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
                onSubmitEditing={onUpdate}
                style={s.input}
              />

              {error ? <Text style={s.error}>{error}</Text> : null}

              <Pressable
                onPress={onUpdate}
                disabled={busy}
                style={({ pressed }) => [
                  s.primaryButton,
                  { opacity: busy || pressed ? 0.7 : 1 },
                ]}>
                {busy ? (
                  <ActivityIndicator color={p.onPrimary} />
                ) : (
                  <Text style={s.primaryButtonText}>Guardar nueva contraseña</Text>
                )}
              </Pressable>
            </>
          ) : null}

          {mode === "done" ? (
            <>
              <Text style={s.screenTitle}>Contraseña actualizada</Text>
              <View style={s.goldRule} />
              <Text style={s.meta}>{DONE_MESSAGE}</Text>

              <Pressable
                onPress={goLogin}
                style={({ pressed }) => [
                  s.primaryButton,
                  { opacity: pressed ? 0.7 : 1 },
                ]}>
                <Text style={s.primaryButtonText}>Volver al inicio de sesión</Text>
              </Pressable>
            </>
          ) : null}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
