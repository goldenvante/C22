import { useState } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { BackHeader } from "@/components/back-header";
import { eventStyles as s } from "@/features/events/eventStyles";
import { createStaff, ROL_LABEL, type CreateStaffInput } from "@/features/users/api";
import { UserForm } from "@/features/users/UserForm";

type Created = { usuario: string; rol: CreateStaffInput["rol"] };

export default function NewUserScreen() {
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyHint, setCopyHint] = useState(false);

  async function handleSubmit(input: CreateStaffInput) {
    setBusy(true);
    setServerError(null);
    try {
      const done = await createStaff(input);
      // La temporal solo existe aquí: se muestra una vez y no se persiste.
      setCreated({ usuario: done.usuario, rol: done.rol });
      setTempPassword(input.password);
      setCopied(false);
      setCopyHint(false);
    } catch (e) {
      // Se conserva el formulario para corregir (duplicado, datos, etc.).
      setServerError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy() {
    if (!tempPassword) return;
    const clipboard = (
      globalThis as unknown as {
        navigator?: { clipboard?: { writeText: (t: string) => Promise<void> } };
      }
    ).navigator?.clipboard;
    if (clipboard) {
      try {
        await clipboard.writeText(tempPassword);
        setCopied(true);
        return;
      } catch {
        // Cae al modo seleccionable de abajo.
      }
    }
    setCopyHint(true);
  }

  function handleAnother() {
    setCreated(null);
    setTempPassword(null);
    setCopied(false);
    setCopyHint(false);
    setServerError(null);
  }

  return (
    <View style={s.screen}>
      <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
        <ScrollView contentContainerStyle={s.scroll}>
          <Text style={s.screenTitle}>Nuevo usuario</Text>
          <View style={s.goldRule} />
          <BackHeader fallback="/(admin)/usuarios" />

          {created && tempPassword ? (
            <View style={s.card}>
              <Text style={s.sectionTitle}>Usuario creado</Text>
              <Text style={s.body}>
                {created.usuario} · {ROL_LABEL[created.rol]}
              </Text>
              <Text style={s.meta}>
                Esta es la contraseña temporal. Entrégala al usuario: no volverá a mostrarse.
              </Text>
              <Text selectable style={[s.fieldText, { fontSize: 20, textAlign: "center" }]}>
                {tempPassword}
              </Text>
              <Pressable
                onPress={handleCopy}
                style={({ pressed }) => [s.secondaryButton, { opacity: pressed ? 0.7 : 1 }]}>
                <Text style={s.secondaryButtonText}>
                  {copied ? "Copiada" : "Copiar contraseña"}
                </Text>
              </Pressable>
              {copyHint && Platform.OS !== "web" ? (
                <Text style={s.meta}>Mantén presionado el texto para copiarlo.</Text>
              ) : null}
              <Pressable
                onPress={handleAnother}
                style={({ pressed }) => [s.primaryButton, { opacity: pressed ? 0.7 : 1 }]}>
                <Text style={s.primaryButtonText}>Crear otro usuario</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Text style={s.meta}>
                Solo Vendedor o Control de acceso. Al entrar por primera vez deberá cambiarla.
              </Text>
              <UserForm busy={busy} serverError={serverError} onSubmit={handleSubmit} />
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
