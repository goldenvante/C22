import { useCallback, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";

import { BackHeader } from "@/components/back-header";
import {
  deleteEventImage,
  eventImagePathFromUrl,
  getEvent,
  updateEvent,
  uploadEventImage,
} from "@/features/events/api";
import { EventForm, type EventFormValues, type PendingEventImage } from "@/features/events/EventForm";
import { useEventStyles } from "@/features/events/eventStyles";
import type { EventItem } from "@/features/events/types";

export default function EditEventScreen() {
  const { s, p } = useEventStyles();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [event, setEvent] = useState<EventItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) {
      setLoading(false);
      return;
    }
    try {
      setEvent(await getEvent(id));
    } catch (e) {
      setServerError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function handleSubmit(values: EventFormValues, pendingImage: PendingEventImage) {
    if (!event) return;
    setBusy(true);
    setServerError(null);
    const oldUrl = event.imagen_url;
    try {
      // 1. Si hay imagen nueva, subirla primero.
      let imagenUrl: string | null = values.imagen_url ? values.imagen_url : null;
      if (pendingImage) {
        const uploaded = await uploadEventImage(event.id, pendingImage.localUri, pendingImage.mimeType);
        imagenUrl = uploaded.publicUrl;
      }
      // 2. Actualizar el evento (conservar, reemplazar o quitar).
      await updateEvent(event.id, {
        nombre: values.nombre,
        codigo: values.codigo,
        fecha: values.fecha,
        hora: values.hora ? values.hora : null,
        lugar: values.lugar ? values.lugar : null,
        mapas_url: values.mapas_url ? values.mapas_url : null,
        imagen_url: imagenUrl,
      });
      // 3. Limpieza best-effort de la anterior, solo tras guardar bien.
      if ((pendingImage || imagenUrl === null) && oldUrl) {
        const oldPath = eventImagePathFromUrl(oldUrl);
        if (oldPath) {
          deleteEventImage(oldPath).catch(() => undefined);
        }
      }
      router.back();
    } catch (e) {
      setServerError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={p.primary} />
      </View>
    );
  }

  return (
    <View style={s.screen}>
      <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
        {!event ? (
          <View style={s.scroll}>
            <Text style={s.error}>{serverError ?? "El evento no existe."}</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={s.scroll}>
            <Text style={s.screenTitle}>Editar evento</Text>
            <View style={s.goldRule} />
            <BackHeader fallback="/(admin)" />
            <EventForm
              initial={{
                nombre: event.nombre,
                codigo: event.codigo,
                fecha: event.fecha,
                hora: event.hora ? event.hora.slice(0, 5) : "",
                lugar: event.lugar ?? "",
                mapas_url: event.mapas_url ?? "",
                imagen_url: event.imagen_url ?? "",
              }}
              submitLabel="Guardar cambios"
              busy={busy}
              serverError={serverError}
              onSubmit={handleSubmit}
            />
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}
