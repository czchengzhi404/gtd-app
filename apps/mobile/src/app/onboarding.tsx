import { router } from "expo-router";

import { Onboarding, useT } from "@gtd/ui";
import { quickAdd, runCommand } from "@gtd/core";

/**
 * 首次启动引导：写 kv["onboarding.done"] 之后回到收集箱。
 * 示例任务只是让新用户看到「解析结果」，可随时删除。
 */
export default function OnboardingScreen() {
  const t = useT();

  const finish = async (withSample: boolean) => {
    if (withSample) {
      await quickAdd(t("onboarding.sampleTask"), Date.now()).catch(() => undefined);
    }
    await runCommand("settings.set", { key: "onboarding.done", value: 1 }).catch(() => undefined);
    router.replace("/(tabs)");
  };

  return <Onboarding onDone={() => void finish(false)} onTrySample={() => void finish(true)} />;
}
