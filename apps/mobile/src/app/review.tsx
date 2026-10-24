import { router } from "expo-router";
import { View } from "react-native";

import { ReviewWizard, Screen, useAppStore } from "@gtd/ui";

/** 每周回顾向导（GTD 五步 + 完成） */
export default function ReviewScreen() {
  const state = useAppStore((s) => s);
  return (
    <Screen>
      <View style={{ flex: 1 }}>
        <ReviewWizard
          state={state}
          now={Date.now()}
          onGoInbox={() => router.navigate("/")}
          onOpenTask={(taskId) => router.push(`/task/${taskId}`)}
          onFinish={() => {
            if (router.canGoBack()) router.back();
            else router.navigate("/more");
          }}
        />
      </View>
    </Screen>
  );
}
