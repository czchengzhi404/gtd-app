import { useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import type { Project, Task } from "@gtd/core";
import { useTheme } from "../hooks/useTheme";
import { AppText } from "../theme/AppText";
import { elevation, hit, radius, space } from "../theme/tokens";
import { useT } from "../i18n";
import { fuzzyScore as score } from "../lib/fuzzy";

export interface CommandPaletteProps {
  visible: boolean;
  tasks: Task[];
  projects: Project[];
  onClose: () => void;
  onOpenTask: (taskId: string) => void;
  onOpenProject: (projectId: string) => void;
  /** 输入非空且无匹配时，回车创建任务 */
  onCreateTask?: (title: string) => void;
}

interface Result {
  key: string;
  kind: "task" | "project" | "create";
  label: string;
  sub?: string;
  action: () => void;
}

/**
 * 命令面板（Ctrl+K）：模糊搜索任务与项目，回车直达。
 * 桌面端为主要入口；移动端也可从标题栏图标打开。
 */
export function CommandPalette({
  visible,
  tasks,
  projects,
  onClose,
  onOpenTask,
  onOpenProject,
  onCreateTask,
}: CommandPaletteProps) {
  const colors = useTheme();
  const t = useT();
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setQuery("");
      setHighlight(0);
      const timer = setTimeout(() => inputRef.current?.focus(), 60);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [visible]);

  const results = useMemo<Result[]>(() => {
    const q = query.trim();
    const list: Result[] = [];

    const taskHits = tasks
      .map((task) => ({ task, s: score(task.title, q) }))
      .filter((entry) => q.length === 0 || entry.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 8)
      .map(({ task }) => ({
        key: `task-${task.id}`,
        kind: "task" as const,
        label: task.title,
        sub: t("palette.task"),
        action: () => onOpenTask(task.id),
      }));
    list.push(...taskHits);

    const projectHits = projects
      .map((project) => ({ project, s: score(project.name, q) }))
      .filter((entry) => q.length === 0 || entry.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 4)
      .map(({ project }) => ({
        key: `project-${project.id}`,
        kind: "project" as const,
        label: project.name,
        sub: t("palette.project"),
        action: () => onOpenProject(project.id),
      }));
    list.push(...projectHits);

    if (q.length > 0 && onCreateTask !== undefined) {
      list.push({
        key: "create",
        kind: "create",
        label: t("palette.create", { title: q }),
        action: () => onCreateTask(q),
      });
    }
    return list;
  }, [query, tasks, projects, onCreateTask, onOpenTask, onOpenProject, t]);

  useEffect(() => {
    if (highlight >= results.length) setHighlight(Math.max(0, results.length - 1));
  }, [results.length, highlight]);

  const run = (result: Result | undefined) => {
    if (result === undefined) return;
    onClose();
    result.action();
  };

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("palette.close")}
        style={[styles.backdrop, { backgroundColor: colors.overlay }]}
        onPress={onClose}
      />
      <View style={styles.center} pointerEvents="box-none">
        <View
          accessibilityRole="menu"
          style={[styles.sheet, elevation.float, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <View style={[styles.inputRow, { borderBottomColor: colors.border }]}>
            <Ionicons name="search" size={17} color={colors.textTertiary} />
            <TextInput
              ref={inputRef}
              accessibilityLabel={t("palette.placeholder")}
              placeholder={t("palette.placeholder")}
              placeholderTextColor={colors.textTertiary}
              value={query}
              onChangeText={setQuery}
              allowFontScaling={false}
              maxFontSizeMultiplier={1}
              returnKeyType="go"
              onSubmitEditing={() => run(results[highlight])}
              onKeyPress={(event) => {
                const key = (event.nativeEvent as { key?: string }).key;
                if (key === "ArrowDown") setHighlight((i) => Math.min(results.length - 1, i + 1));
                if (key === "ArrowUp") setHighlight((i) => Math.max(0, i - 1));
              }}
              style={[styles.input, { color: colors.text }]}
            />
            <AppText variant="caption" tone="tertiary" lines={1}>
              esc
            </AppText>
          </View>

          <FlatList
            data={results}
            keyExtractor={(item) => item.key}
            keyboardShouldPersistTaps="handled"
            style={styles.list}
            renderItem={({ item, index }) => {
              const active = index === highlight;
              return (
                <Pressable
                  accessibilityRole="menuitem"
                  accessibilityLabel={`${item.sub ?? ""} ${item.label}`}
                  accessibilityState={{ selected: active }}
                  onPress={() => run(item)}
                  onHoverIn={() => setHighlight(index)}
                  style={({ pressed }) => [
                    styles.item,
                    {
                      backgroundColor: active ? colors.surfaceMuted : pressed ? colors.surfaceMuted : "transparent",
                    },
                  ]}
                >
                  <Ionicons
                    name={item.kind === "project" ? "folder-outline" : item.kind === "create" ? "add-circle-outline" : "document-text-outline"}
                    size={16}
                    color={item.kind === "create" ? colors.primary : colors.textTertiary}
                  />
                  <AppText variant="body" lines={1} style={styles.itemLabel} color={item.kind === "create" ? colors.primary : colors.text}>
                    {item.label}
                  </AppText>
                  {item.sub !== undefined ? (
                    <AppText variant="caption" tone="tertiary" lines={1}>
                      {item.sub}
                    </AppText>
                  ) : null}
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <AppText variant="label" tone="tertiary" align="center" lines={2} style={styles.empty}>
                {t("palette.noResult")}
              </AppText>
            }
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 80,
    paddingHorizontal: space.lg,
  },
  sheet: {
    width: "100%",
    maxWidth: 560,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    height: hit.button,
    paddingHorizontal: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    height: 44,
    padding: 0,
  },
  list: {
    maxHeight: 380,
  },
  item: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.md,
  },
  itemLabel: {
    flex: 1,
    minWidth: 0,
  },
  empty: {
    paddingVertical: space.xl,
  },
});
