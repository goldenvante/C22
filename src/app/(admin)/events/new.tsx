import { useState } from "react";
import { Alert, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { BackHeader } from "@/components/back-header";
import { createEvent, updateEvent, uploadEventImage } from "@/features/events/api";
import { EventForm, type EventFormValues, type PendingEventImage } from "@/features/events/EventForm";
import { eventStyles as s } from "@/features/events/eventStyles";

export default function NewEventScreen() {
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  async function handleSubmit(values: EventFormValues, pendingImage: PendingEventImage) {
    setBusy(true);
    setServerError(null);
    try {
      // 1. Crear primero sin imagen para obtener el eventId.
      const created = await createEvent({
        nombre: values.nombre,
        codigo: values.codigo,
        fecha: values.fecha,
        hora: values.hora ? values.hora : null,
        lugar: values.lugar ? values.lugar : null,
        mapas_url: values.mapas_url ? values.mapas_url : null,
        imagen_url: null,
      });
      // 2. Si hay imagen pendiente, subirla y guardar la URL pública.
      if (pendingImage) {
        try {
          const uploaded = await uploadEventImage(
            created.id,
            pendingImage.localUri,
            pendingImage.mimeType,
          );
          await updateEvent(created.id, { imagen_url: uploaded.publicUrl });
        } catch (e) {
          // El evento queda creado sin imagen (nunca con file://).
          Alert.alert(
            "Imagen no subida",
            `El evento se creó, pero la imagen no pudo subirse: ${(e as Error).message}`,
          );
        }
      }
      router.replace({ pathname: "/(admin)/events/[id]", params: { id: created.id } });
    } catch (e) {
      setServerError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={s.screen}>
      <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
        <ScrollView contentContainerStyle={s.scroll}>
          <Text style={s.screenTitle}>Nuevo evento</Text>
          <View style={s.goldRule} />
          <BackHeader fallback="/(admin)" />
          <Text style={s.meta}>Se crea en estado Borrador.</Text>
          <EventForm submitLabel="Crear evento" busy={busy} serverError={serverError} onSubmit={handleSubmit} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
