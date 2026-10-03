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
  addInvestment,
  computeProgress,
  computeTotals,
  createGoal,
  formatFechaCorta,
  formatMoney,
  getActiveGoal,
  listIncomes,
  listInvestments,
  updateGoal,
  type SavingsGoal,
  type SavingsIncome,
  type SavingsInvestment,
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
 * Meta del comité (misma pantalla para admin, seller y access): recaudado
 * (cierres de evento + ingresos manuales), lo invertido y lo disponible.
 * Solo el admin agrega ingresos e inversiones y crea/edita la meta; el resto
 * solo consulta (bitácora de solo-agregar).
 */
export default function SavingsScreen() {
  const { s, p } = useEventStyles();
  const { profile } = useAuth();
  const { committee } = useCommittee();
  const isAdmin = hasRole(profile, "admin");

  const [goal, setGoal] = useState<SavingsGoal | null>(null);
  const [incomes, setIncomes] = useState<SavingsIncome[]>([]);
  const [investments, setInvestments] = useState<SavingsInvestment[]>([]);
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
  // Form inversión (admin)
  const [invConcepto, setInvConcepto] = useState("");
  const [invMonto, setInvMonto] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [invMessage, setInvMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!committee) {
      setLoading(false);
      return;
    }
    try {
      setError(null);
      const [g, inc, inv] = await Promise.all([
        getActiveGoal(committee.id),
        listIncomes(),
        listInvestments(),
      ]);
      setGoal(g);
      setIncomes(inc);
      setInvestments(inv);
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

  async function handleAddInvestment() {
    if (busy) return;
    setInvMessage(null);
    const montoNum = Number(String(invMonto).replace(/[$,\s]/g, ""));
    setBusy(true);
    try {
      const created = await addInvestment(invConcepto, montoNum);
      setInvestments((prev) => [created, ...prev]);
      setInvConcepto("");
      setInvMonto("");
      setInvMessage("Inversión registrada.");
    } catch (e) {
      setInvMessage((e as Error).message);
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

  const totals = computeTotals(incomes, investments);
  const progress = goal ? computeProgress(goal, totals) : null;

  // La ruta aporta pantalla + scroll: aquí solo contenido con separación.
  return (
    <View style={{ gap: 16 }}>
      <Text style={s.screenTitle}>Meta</Text>
      <View style={s.goldRule} />
      <Text style={s.meta}>{committee.nombre}</Text>

      {error ? <Text style={s.error}>{error}</Text> : null}

      <View style={s.card}>
        <View style={s.row}>
          <Text style={[s.sectionTitle, { flex: 1 }]}>
            {goal ? goal.nombre : "Recaudado"}
          </Text>
          {isAdmin && goal ? (
            <Pressable onPress={() => setEditingGoal((v) => !v)} disabled={busy}>
              <Text style={s.link}>{editingGoal ? "Cancelar" : "Editar"}</Text>
            </Pressable>
          ) : null}
        </View>

        {editingGoal && isAdmin && goal ? (
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
        ) : goal && progress ? (
          <>
            <Text style={s.meta}>Meta: {formatMoney(Number(goal.meta))}</Text>
            <Text style={[s.screenTitle, { fontSize: 32 }]}>
              {formatMoney(progress.disponible)}
            </Text>
            <Text style={s.smallBold}>
              {progress.superada
                ? `¡Meta superada por ${formatMoney(Math.abs(progress.restante))}!`
                : `Faltan ${formatMoney(progress.restante)}`}
            </Text>
            <ProgressBar porcentaje={progress.porcentaje} />
            <Text style={s.meta}>{progress.porcentaje.toFixed(1)}% de la meta</Text>
            <Text style={s.meta}>
              Recaudado {formatMoney(totals.recaudado)} · Invertido{" "}
              {formatMoney(totals.inversion)}
            </Text>
          </>
        ) : (
          <>
            <Text style={[s.screenTitle, { fontSize: 32 }]}>
              {formatMoney(totals.recaudado)}
            </Text>
            <Text style={s.meta}>
              {isAdmin
                ? "Aún no hay meta activa. Lo que cierre un evento se suma aquí."
                : "El administrador aún no define la meta de ahorro."}
            </Text>
          </>
        )}
      </View>

      {!goal && isAdmin ? (
        <View style={s.card}>
          <Text style={s.sectionTitle}>Crear meta</Text>
          <Text style={s.meta}>Nombre y monto objetivo de la meta de ahorro.</Text>
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
        </View>
      ) : null}

      <View style={s.card}>
        <Text style={s.sectionTitle}>Agregar ingreso</Text>
        {!isAdmin ? (
          <Text style={s.meta}>Solo el administrador registra ingresos.</Text>
        ) : goal ? (
          <>
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
          </>
        ) : (
          <Text style={s.meta}>Crea la meta para registrar ingresos manuales.</Text>
        )}
      </View>

      <View style={s.card}>
        <Text style={s.sectionTitle}>Inversión</Text>
        <Text style={[s.screenTitle, { fontSize: 32 }]}>
          {formatMoney(totals.inversion)}
        </Text>
        <Text style={s.meta}>
          Disponible en Meta: {formatMoney(totals.disponible)}
        </Text>

        {isAdmin ? (
          <>
            <Text style={s.label}>¿En qué se usó?</Text>
            <TextInput
              value={invConcepto}
              onChangeText={setInvConcepto}
              placeholder="p. ej. Renta de salón"
              placeholderTextColor={p.textSoft}
              editable={!busy}
              maxLength={80}
              style={s.input}
            />
            <Text style={s.label}>Egreso (MXN)</Text>
            <TextInput
              value={invMonto}
              onChangeText={setInvMonto}
              placeholder="p. ej. 3000"
              placeholderTextColor={p.textSoft}
              keyboardType="decimal-pad"
              editable={!busy}
              onSubmitEditing={handleAddInvestment}
              style={s.input}
            />
            <Pressable
              onPress={handleAddInvestment}
              disabled={busy}
              style={({ pressed }) => [s.primaryButton, { opacity: busy || pressed ? 0.7 : 1 }]}>
              {busy ? (
                <ActivityIndicator color={p.onPrimary} />
              ) : (
                <Text style={s.primaryButtonText}>+ Registrar inversión</Text>
              )}
            </Pressable>
            {invMessage ? <Text style={s.meta}>{invMessage}</Text> : null}
          </>
        ) : (
          <Text style={s.meta}>Solo el administrador registra inversiones.</Text>
        )}

        {investments.length > 0 ? (
          <View style={{ gap: 12, marginTop: 4 }}>
            {investments.map((item) => (
              <View key={item.id} style={s.card}>
                <View style={s.row}>
                  <Text style={[s.smallBold, { flex: 1 }]}>{item.concepto}</Text>
                  <Text style={[s.smallBold, { color: p.primary }]}>
                    {formatMoney(Number(item.monto))}
                  </Text>
                </View>
                <Text style={s.meta}>
                  {formatFechaCorta(item.created_at)}
                  {item.registrado_nombre ? ` · ${item.registrado_nombre}` : ""}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={s.meta}>Aún no hay inversiones.</Text>
        )}
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
    </View>
  );
}
