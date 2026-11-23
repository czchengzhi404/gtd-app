import { useMemo } from "react";
import { router } from "expo-router";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  PageHeader,
  StatTile,
  TaskList,
  space,
  useAppStore,
  useTheme,
  useT,
} from "@gtd/ui";
import { countWords, getMaterials, selectContexts } from "@gtd/core";

import { useTaskActions } from "@/hooks/useRowActions";
import { openTaskContextMenu } from "@/lib/context-menu";
import { completeTaskWithUndo } from "@/lib/task-ops";

/** 一行三张统计卡片的尺寸覆盖：等分、允许收缩 */
const tileStyle = { minWidth: 0, flexBasis: 0, flex: 1 } as const;

/**
 * 素材库：someday 状态的条目集中看。
 *
 * 为什么不是新实体：写作者的"素材"就是"还没决定用在哪儿的东西"，与 GTD 的
 * someday 语义一致；复用现有模型可以不改 schema / 命令 / 同步 / 合并四层。
 */
export default function MaterialsScreen() {
  const items = useAppStore(getMaterials);
  const contexts = useAppStore(selectContexts);
  const loaded = useAppStore((s) => s.loaded);
  const insets = useSafeAreaInsets();
  const colors = useTheme();
  const t = useT();
  const actions = useTaskActions();

  const contextNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const context of contexts) map[context.id] = context.name;
    return map;
  }, [contexts]);

  const totalWords = useMemo(
    () => items.reduce((sum, task) => sum + countWords(task.notes), 0),
    [items],
  );
  const withBody = useMemo(() => items.filter((task) => task.notes.trim().length > 0).length, [items]);

  if (!loaded) return null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas, paddingTop: insets.top }}>
      {/* Stack header 已隐藏（见 _layout.tsx）：自绘标题要自己顶开状态栏 */}
      <View style={{ paddingTop: insets.top }}>
        <PageHeader
          title={t("materials.title")}
          subtitle={t("materials.subtitle")}
          onBack={() => router.back()}
          backLabel={t("app.common.back")}
        />
      </View>

      <View style={{ flexDirection: "row", gap: space.sm, paddingHorizontal: space.lg, paddingBottom: space.sm }}>
        {/* 窄屏一行三张：必须压掉 StatTile 默认的 minWidth/flexBasis，否则右侧会被裁掉 */}
        <StatTile label={t("materials.count")} value={`${items.length}`} style={tileStyle} />
        <StatTile label={t("materials.withBody")} value={`${withBody}`} style={tileStyle} />
        <StatTile label={t("materials.words")} value={`${totalWords}`} style={tileStyle} />
      </View>
      <TaskList
        tasks={items}
        now={Date.now()}
        contextNameById={contextNameById}
        actions={actions}
        onContextMenuTask={(task, position) => openTaskContextMenu(task, position)}
        onToggleTask={(task) => void completeTaskWithUndo(task)}
        onPressTask={(task) => router.push(`/task/${task.id}`)}
        emptyIllustration="inbox"
        emptyTitle={t("materials.empty")}
        emptyHint={t("materials.emptyHint")}
      />
    </View>
  );
}
