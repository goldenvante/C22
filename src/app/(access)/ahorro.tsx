import { SafeAreaView } from "react-native-safe-area-context";
import { ScrollView, View } from "react-native";

import { BackHeader } from "@/components/back-header";
import { useEventStyles } from "@/features/events/eventStyles";
import SavingsScreen from "@/features/savings/SavingsScreen";

export default function AccessAhorro() {
  const { s } = useEventStyles();
  return (
    <View style={s.screen}>
      <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
        <ScrollView contentContainerStyle={s.scroll}>
          <BackHeader fallback="/(access)" />
          <SavingsScreen />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
