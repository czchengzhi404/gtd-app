import { useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { View } from "react-native";

import { Screen, Spinner, useT } from "@gtd/ui";
import { quickAdd } from "@gtd/core";

/**
 * 深层链接入口：gtd://add?title=买牛奶&notes=...
 * 从浏览器书签、桌面快捷方式或其它应用一键丢任务进收集箱。
 * 添加完成后回到收集箱。
 */
export default function QuickCaptureScreen() {
  const params = useLocalSearchParams<{ title?: string; text?: string }>();
  const t = useT();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const raw = (params.title ?? params.text ?? "").trim();
    void (async () => {
      try {
        if (raw.length > 0) {
          await quickAdd(raw, Date.now());
        }
      } catch {
        setFailed(true);
        return;
      }
      router.replace("/");
    })();
  }, [params.title, params.text]);

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: "center" }}>
        {failed ? (
          <Spinner label={t("capture.failed")} />
        ) : (
          <Spinner label={t("capture.adding")} />
        )}
      </View>
    </Screen>
  );
}
