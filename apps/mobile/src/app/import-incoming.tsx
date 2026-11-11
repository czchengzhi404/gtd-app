import { useEffect, useRef, useState } from "react";
import { router } from "expo-router";
import { StyleSheet, View } from "react-native";

import { AppText, Button, Screen, space, useTheme, useT } from "@gtd/ui";
import { mergeImportedJson } from "@/platform/desktop-actions";
import { readIncomingFile, takePendingImportUrl } from "@/platform/incoming-file";

/**
 * 接住别的应用递进来的 JSON 并导入。
 *
 * 为什么要单独一个页面，而不是在根布局里直接干：
 * `content://` 会被 expo-router 当成深链，直接渲染成 Unmatched Route，
 * 而根布局里的代码既拿不到那个 URL、也没法在路由尚未就绪时可靠地跳转。
 * 改成「`+native-intent` 把这个 URL 改写成一条正常路由」之后，
 * 路由系统全程都是自洽的。
 *
 * 文件 URL 从 `incoming-file` 的模块变量取（不经过路由参数，见该文件的说明）。
 */
export default function ImportIncomingScreen() {
  const colors = useTheme();
  const t = useT();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);
  // 防止 StrictMode 下 effect 跑两遍导致重复导入
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const rawUrl = takePendingImportUrl();
    if (rawUrl === null) {
      // 直接访问这个页面（没有待导入文件）—— 当成误入，回数据页
      router.replace("/data");
      return;
    }

    void (async () => {
      try {
        const text = await readIncomingFile(rawUrl);
        const message = await mergeImportedJson(text);
        setDone(Number((message.match(/(\d+)/) ?? [])[1] ?? 0));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, []);

  // 导入成功后停一下让用户看见结果，再回数据页。
  //
  // 为什么是 3 秒：实测「读文件 → 合并 25 条 → 跳转」全程不到 1 秒，
  // 结果一闪而过，用户会怀疑到底导没导进去。3 秒足够看清条数，
  // 又不至于让人等得不耐烦（这个页面不是终点，只是回执）。
  useEffect(() => {
    if (done === null) return;
    const timer = setTimeout(() => router.replace("/data"), 3000);
    return () => clearTimeout(timer);
  }, [done]);

  return (
    <Screen>
      <View style={styles.wrap}>
        {error === null ? (
          <>
            <AppText variant="title" lines={2}>
              {done === null ? t("more.status.importing") : t("sync.merged", { n: done })}
            </AppText>
            <AppText variant="body" tone="secondary" lines={2}>
              {done === null ? t("import.incomingHint") : t("import.incomingDone")}
            </AppText>
          </>
        ) : (
          <>
            <AppText variant="title" color={colors.danger} lines={2}>
              {t("more.status.importFailed")}
            </AppText>
            <AppText variant="body" tone="secondary" lines={6}>
              {error}
            </AppText>
            <Button
              label={t("import.incomingBack")}
              variant="primary"
              onPress={() => router.replace("/data")}
            />
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: space.xl,
    gap: space.md,
  },
});
