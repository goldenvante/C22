import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";

import { useAuth } from "@/auth/AuthProvider";
import { hasRole } from "@/lib/supabase";
import { useCommittee } from "@/branding/useCommittee";
import { useEventStyles } from "@/features/events/eventStyles";
import {
  addIncome,
  computeProgress,
  createGoal,
  formatFechaCorta,
  formatMoney,
  getActiveGoal,
  listIncomes,
  updateGoal,
  type SavingsGoal,
  type SavingsIncome,
} from "./api";

/** Barra de progreso: fondo tenue, relleno con el color del comité. */
function ProgressBar({ porcentaje }: { porcentaje: number }) {
  const { p } = useEventStyles();
  return (
    <View
      style={{
        height: 14,
        borderRadius: 7,
        backgroundColor: p.secondaryBg,
        borderWidth: 1,
        borderColor: p.border,
        overflow: "hidden",
      }}>
      <View
        style={{
          height: "100%",
          width: `${Math.max(0, Math.min(100, porcentaje))}%`,
          backgroundColor: p.primary,
          borderRadius: 7,
        }}
      />
    </View>
  );
}

/**
 * Ahorro del comité (misma pantalla para admin, seller y access):
 * todos ven la meta, lo recaudado y lo que falta; cualquier miembro puede
 * agregar ingresos (con auditoría); solo el admin crea/edita la meta.
 */
export default function SavingsScreen() {
  const { s, p } = useEventStyles();
  const { profile } = useAuth();
  const { committee } = useCommittee();
  const isAdmin = hasRole(profile, "admin");

  const [goal, setGoal] = useState<SavingsGoal | null>(null);
  const [incomes, setIncomes] = useState<SavingsIncome[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form meta (admin)
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalNombre, setGoalNombre] = useState("");
  const [goalMeta, setGoalMeta] = useState("");
  // Form ingreso
  const [concepto, setConcepto] = useState("");
  const [monto, setMonto] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!committee) {
      setLoading(false);
      return;
    }
    try {
      setError(null);
      const g = await getActiveGoal(committee.id);
      setGoal(g);
      setIncomes(g ? await listIncomes(g.id) : []);
      if (g) {
        setGoalNombre(g.nombre);
        setGoalMeta(String(g.meta));
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [committee]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function handleSaveGoal() {
    if (!committee || busy) return;
    setMessage(null);
    const metaNum = Number(String(goalMeta).replace(/[$,\s]/g, ""));
    setBusy(true);
    try {
      const saved = goal
        ? await updateGoal(goal.id, goalNombre, metaNum)
        : await createGoal(committee.id, goalNombre, metaNum);
      setGoal(saved);
      setGoalNombre(saved.nombre);
      setGoalMeta(String(saved.meta));
      setEditingGoal(false);
      setMessage("Meta guardada.");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleAddIncome() {
    if (!goal || busy) return;
    setMessage(null);
    const montoNum = Number(String(monto).replace(/[$,\s]/g, ""));
    setBusy(true);
    try {
      const created = await addIncome(goal.id, concepto, montoNum);
      setIncomes((prev) => [created, ...prev]);
      setConcepto("");
      setMonto("");
      setMessage("Ingreso registrado.");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!committee) {
    return (
      <View style={s.center}>
        <Text style={s.meta}>Aún no tienes comité asignado.</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={p.primary} />
      </View>
    );
  }

  const progress = goal ? computeProgress(goal, incomes) : null;

  // La ruta aporta pantalla + scroll: aquí solo contenido con separación.
  return (
    <View style={{ gap: 16 }}>
      <Text style={s.screenTitle}>Ahorro</Text>
        <View style={s.goldRule} />
        <Text style={s.meta}>{committee.nombre}</Text>

        {error ? <Text style={s.error}>{error}</Text> : null}

        {!goal ? (
          <View style={s.card}>
            <Text style={s.sectionTitle}>Sin meta todavía</Text>
            {isAdmin ? (
              <>
                <Text style={s.meta}>Crea la meta de ahorro: nombre y monto objetivo.</Text>
                <Text style={s.label}>Nombre de la meta</Text>
                <TextInput
                  value={goalNombre}
                  onChangeText={setGoalNombre}
                  placeholder="p. ej. Fiesta patronal"
                  placeholderTextColor={p.textSoft}
                  editable={!busy}
                  maxLength={80}
                  style={s.input}
                />
                <Text style={s.label}>Monto objetivo (MXN)</Text>
                <TextInput
                  value={goalMeta}
                  onChangeText={setGoalMeta}
                  placeholder="p. ej. 50000"
                  placeholderTextColor={p.textSoft}
                  keyboardType="decimal-pad"
                  editable={!busy}
                  style={s.input}
                />
                <Pressable
                  onPress={handleSaveGoal}
                  disabled={busy}
                  style={({ pressed }) => [s.primaryButton, { opacity: busy || pressed ? 0.7 : 1 }]}>
                  {busy ? (
                    <ActivityIndicator color={p.onPrimary} />
                  ) : (
                    <Text style={s.primaryButtonText}>Crear meta</Text>
                  )}
                </Pressable>
              </>
            ) : (
              <Text style={s.meta}>El administrador aún no define la meta de ahorro.</Text>
            )}
          </View>
        ) : (
          <>
            <View style={s.card}>
              <View style={s.row}>
                <Text style={[s.sectionTitle, { flex: 1 }]}>{goal.nombre}</Text>
                {isAdmin ? (
                  <Pressable onPress={() => setEditingGoal((v) => !v)} disabled={busy}>
                    <Text style={s.link}>{editingGoal ? "Cancelar" : "Editar"}</Text>
                  </Pressable>
                ) : null}
              </View>

              {editingGoal && isAdmin ? (
                <>
                  <Text style={s.label}>Nombre de la meta</Text>
                  <TextInput
                    value={goalNombre}
                    onChangeText={setGoalNombre}
                    placeholder="p. ej. Fiesta patronal"
                    placeholderTextColor={p.textSoft}
                    editable={!busy}
                    maxLength={80}
                    style={s.input}
                  />
                  <Text style={s.label}>Monto objetivo (MXN)</Text>
                  <TextInput
                    value={goalMeta}
                    onChangeText={setGoalMeta}
                    placeholder="p. ej. 50000"
                    placeholderTextColor={p.textSoft}
                    keyboardType="decimal-pad"
                    editable={!busy}
                    style={s.input}
                  />
                  <Pressable
                    onPress={handleSaveGoal}
                    disabled={busy}
                    style={({ pressed }) => [s.primaryButton, { opacity: busy || pressed ? 0.7 : 1 }]}>
                    {busy ? (
                      <ActivityIndicator color={p.onPrimary} />
                    ) : (
                      <Text style={s.primaryButtonText}>Guardar meta</Text>
                    )}
                  </Pressable>
                </>
              ) : (
                <>
                  <Text style={s.meta}>Meta: {formatMoney(Number(goal.meta))}</Text>
                  <Text style={[s.screenTitle, { fontSize: 32 }]}>
                    {formatMoney(progress!.recaudado)}
                  </Text>
                  <Text style={s.smallBold}>
                    {progress!.superada
                      ? `¡Meta superada por ${formatMoney(Math.abs(progress!.restante))}!`
                      : `Faltan ${formatMoney(progress!.restante)}`}
                  </Text>
                  <ProgressBar porcentaje={progress!.porcentaje} />
                  <Text style={s.meta}>{progress!.porcentaje.toFixed(1)}% de la meta</Text>
                </>
              )}
            </View>

            <View style={s.card}>
              <Text style={s.sectionTitle}>Agregar ingreso</Text>
              <Text style={s.label}>¿De dónde salió?</Text>
              <TextInput
                value={concepto}
                onChangeText={setConcepto}
                placeholder="p. ej. Bazar septiembre"
                placeholderTextColor={p.textSoft}
                editable={!busy}
                maxLength={80}
                style={s.input}
              />
              <Text style={s.label}>Ingreso (MXN)</Text>
              <TextInput
                value={monto}
                onChangeText={setMonto}
                placeholder="p. ej. 10000"
                placeholderTextColor={p.textSoft}
                keyboardType="decimal-pad"
                editable={!busy}
                onSubmitEditing={handleAddIncome}
                style={s.input}
              />
              <Pressable
                onPress={handleAddIncome}
                disabled={busy}
                style={({ pressed }) => [s.primaryButton, { opacity: busy || pressed ? 0.7 : 1 }]}>
                {busy ? (
                  <ActivityIndicator color={p.onPrimary} />
                ) : (
                  <Text style={s.primaryButtonText}>+ Registrar ingreso</Text>
                )}
              </Pressable>
              {message ? <Text style={s.meta}>{message}</Text> : null}
            </View>

            <Text style={s.sectionTitle}>Ingresos ({incomes.length})</Text>
            <FlatList
              data={incomes}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              contentContainerStyle={{ gap: 12 }}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={() => {
                    setRefreshing(true);
                    load();
                  }}
                />
              }
              ListEmptyComponent={<Text style={s.meta}>Aún no hay ingresos registrados.</Text>}
              renderItem={({ item }) => (
                <View style={s.card}>
                  <View style={s.row}>
                    <Text style={[s.smallBold, { flex: 1 }]}>{item.concepto}</Text>
                    <Text style={[s.smallBold, { color: p.primary }]}>{formatMoney(Number(item.monto))}</Text>
                  </View>
                  <Text style={s.meta}>
                    {formatFechaCorta(item.created_at)}
                    {item.registrado_nombre ? ` · ${item.registrado_nombre}` : ""}
                  </Text>
                </View>
              )}
            />
          </>
        )}
    </View>
  );
}
