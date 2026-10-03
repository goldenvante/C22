import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import { BackHeader } from "@/components/back-header";
import { useAuth } from "@/auth/AuthProvider";
import { useEventStyles } from "@/features/events/eventStyles";
import {
  listStaff,
  profileRolesLabel,
  resetStaffPassword,
  setActivo,
  updateNombre,
  updateRoles,
  STAFF_ROLES,
  ROL_LABEL,
  type StaffRole,
} from "@/features/users/api";
import { hasRole, type Profile } from "@/lib/supabase";

export default function UsersScreen() {
  const { s, p } = useEventStyles();
  const { profile: self } = useAuth();
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNombre, setEditNombre] = useState("");
  const [resetId, setResetId] = useState<string | null>(null);
  const [resetPass, setResetPass] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setUsers(await listStaff());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function handleToggle(user: Profile) {
    const next = !user.activo;
    const apply = async () => {
      setBusyId(user.id);
      setError(null);
      try {
        await setActivo(user.id, next);
        await load();
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusyId(null);
      }
    };
    if (!next) {
      Alert.alert(
        "Desactivar usuario",
        `¿Desactivar a ${user.nombre} (@${user.usuario})? No podrá iniciar sesión.`,
        [
          { text: "Cancelar", style: "cancel" },
          { text: "Desactivar", style: "destructive", onPress: apply },
        ],
      );
    } else {
      await apply();
    }
  }

  async function handleSaveNombre(user: Profile) {
    setBusyId(user.id);
    setError(null);
    try {
      await updateNombre(user.id, editNombre);
      setEditingId(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleToggleRole(user: Profile, role: StaffRole) {
    const current = (user.roles ?? []).filter((r): r is StaffRole => r === "seller" || r === "access");
    const next = current.includes(role)
      ? current.filter((r) => r !== role)
      : [...current, role];
    if (next.length < 1) {
      setError("El usuario debe tener al menos un rol.");
      return;
    }
    setBusyId(user.id);
    setError(null);
    try {
      await updateRoles(user.id, next);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleResetPassword(user: Profile) {
    setBusyId(user.id);
    setError(null);
    try {
      await resetStaffPassword(user.id, resetPass);
      setResetId(null);
      setResetPass("");
      Alert.alert(
        "Contraseña restablecida",
        `Contraseña temporal lista para @${user.usuario}. Al iniciar sesión deberá cambiarla por la suya.`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <View style={s.screen}>
      <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
        <View style={[s.scroll, { flex: 1 }]}>
          <Text style={s.screenTitle}>Usuarios</Text>
          <View style={s.goldRule} />
          <BackHeader fallback="/(admin)" />

          {loading ? (
            <View style={s.center}>
              <ActivityIndicator color={p.primary} />
            </View>
          ) : (
            <FlatList
              data={users}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ gap: 12, paddingBottom: 24 }}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
              ListHeaderComponent={error ? <Text style={s.error}>{error}</Text> : null}
              ListEmptyComponent={
                !error ? <Text style={s.meta}>Aún no hay usuarios registrados.</Text> : null
              }
              renderItem={({ item }) => {
                const isSelf = item.id === self?.id;
                const busy = busyId === item.id;
                const itemIsAdmin = hasRole(item, "admin");
                const itemRoles = (item.roles ?? []).filter(
                  (r): r is StaffRole => r === "seller" || r === "access",
                );
                return (
                  <View style={s.card}>
                    {editingId === item.id ? (
                      <View style={{ gap: 4 }}>
                        <TextInput
                          value={editNombre}
                          onChangeText={setEditNombre}
                          placeholderTextColor={p.textSoft}
                          editable={!busy}
                          style={s.input}
                        />
                        <View style={s.row}>
                          <Pressable
                            disabled={busy}
                            onPress={() => handleSaveNombre(item)}
                            style={({ pressed }) => [s.secondaryButton, { opacity: pressed ? 0.7 : 1 }]}>
                            <Text style={s.secondaryButtonText}>Guardar</Text>
                          </Pressable>
                          <Pressable disabled={busy} onPress={() => setEditingId(null)}>
                            <Text style={s.link}>Cancelar</Text>
                          </Pressable>
                        </View>
                      </View>
                    ) : (
                      <View style={{ gap: 2 }}>
                        <View style={s.row}>
                          <Text style={[s.smallBold, { flex: 1 }]}>{item.nombre}</Text>
                          <Text style={item.activo ? s.faseOn : s.faseOff}>
                            {item.activo ? "Activo" : "Inactivo"}
                          </Text>
                        </View>
                        <Text style={s.meta}>@{item.usuario}</Text>
                        <Text style={s.meta}>{profileRolesLabel(item)}</Text>
                        {!itemIsAdmin ? (
                          <View style={[s.row, { marginTop: 6 }]}>
                            {STAFF_ROLES.map((r) => {
                              const selected = itemRoles.includes(r);
                              return (
                                <Pressable
                                  key={r}
                                  disabled={busy}
                                  onPress={() => handleToggleRole(item, r)}
                                  style={({ pressed }) => [
                                    s.secondaryButton,
                                    selected && { backgroundColor: p.primary, borderColor: p.primary },
                                    { opacity: pressed || busy ? 0.7 : 1 },
                                  ]}>
                                  <Text style={[s.secondaryButtonText, selected && { color: p.onPrimary }]}>
                                    {selected ? "✓ " : ""}{ROL_LABEL[r]}
                                  </Text>
                                </Pressable>
                              );
                            })}
                          </View>
                        ) : null}
                        <View style={[s.row, { marginTop: 6 }]}>
                          <Pressable
                            disabled={busy}
                            onPress={() => {
                              setEditingId(item.id);
                              setEditNombre(item.nombre);
                              setError(null);
                            }}
                            style={({ pressed }) => [s.secondaryButton, { opacity: pressed ? 0.7 : 1 }]}>
                            <Text style={s.secondaryButtonText}>Editar nombre</Text>
                          </Pressable>
                          <Pressable
                            disabled={busy || isSelf}
                            onPress={() => handleToggle(item)}
                            style={({ pressed }) => [
                              s.secondaryButton,
                              { opacity: pressed || busy || isSelf ? 0.5 : 1 },
                            ]}>
                            <Text style={s.secondaryButtonText}>
                              {item.activo ? "Desactivar" : "Activar"}
                            </Text>
                          </Pressable>
                        </View>
                        {resetId === item.id ? (
                          <View style={{ gap: 4, marginTop: 6 }}>
                            <TextInput
                              value={resetPass}
                              onChangeText={setResetPass}
                              placeholder="Contraseña temporal (mínimo 8)"
                              placeholderTextColor={p.textSoft}
                              secureTextEntry
                              autoCapitalize="none"
                              autoCorrect={false}
                              editable={!busy}
                              style={s.input}
                            />
                            <View style={s.row}>
                              <Pressable
                                disabled={busy}
                                onPress={() => handleResetPassword(item)}
                                style={({ pressed }) => [s.secondaryButton, { opacity: pressed ? 0.7 : 1 }]}>
                                <Text style={s.secondaryButtonText}>Guardar</Text>
                              </Pressable>
                              <Pressable
                                disabled={busy}
                                onPress={() => {
                                  setResetId(null);
                                  setResetPass("");
                                }}>
                                <Text style={s.link}>Cancelar</Text>
                              </Pressable>
                            </View>
                          </View>
                        ) : (
                          <Pressable
                            disabled={busy}
                            onPress={() => {
                              setResetId(item.id);
                              setResetPass("");
                              setError(null);
                            }}
                            style={({ pressed }) => [
                              s.secondaryButton,
                              { marginTop: 6, opacity: pressed || busy ? 0.7 : 1 },
                            ]}>
                            <Text style={s.secondaryButtonText}>Restablecer contraseña</Text>
                          </Pressable>
                        )}
                        {isSelf ? <Text style={s.meta}>Esta es tu cuenta.</Text> : null}
                      </View>
                    )}
                  </View>
                );
              }}
            />
          )}

          <Pressable
            onPress={() => router.push("/(admin)/usuarios/nuevo")}
            style={({ pressed }) => [s.primaryButton, { opacity: pressed ? 0.7 : 1 }]}>
            <Text style={s.primaryButtonText}>+ Nuevo usuario</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}
