import { useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import { EmptyState, ProjectCard, useAppStore, useTheme, useT } from "@gtd/ui";
import {
  appStore,
  getProjectNextAction,
  getProjectTasks,
  quickAdd,
  selectActiveProjects,
} from "@gtd/core";

/** 项目：列表（顺序/并行 + 下一步行动）；新建项目复用快速添加语法 */
export default function ProjectsScreen() {
  const projects = useAppStore(selectActiveProjects);
  const loaded = useAppStore((s) => s.loaded);
  const [creating, setCreating] = useState(false);
  const colors = useTheme();
  const t = useT();

  if (!loaded) return null;

  const createProject = async () => {
    setCreating(true);
    try {
      await quickAdd(`#P${projects.length + 1}`, Date.now());
    } finally {
      setCreating(false);
    }
  };

  return (
    <FlatList
      data={projects}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => {
        const state = appStore.getState();
        const openTasks = getProjectTasks(state, item.id).filter((task) => task.status !== "done");
        const next = getProjectNextAction(state, item.id);
        return (
          <ProjectCard
            project={item}
            openCount={openTasks.length}
            nextActionTitle={next?.title ?? null}
            onPress={() => undefined}
          />
        );
      }}
      ListEmptyComponent={
        <EmptyState title={t("projects.emptyTitle")} hint={t("projects.emptyHint")} />
      }
      ListFooterComponent={
        <View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("projects.create")}
            disabled={creating}
            onPress={() => void createProject()}
            style={({ pressed }) => [
              styles.createButton,
              { backgroundColor: colors.surface, opacity: creating ? 0.5 : pressed ? 0.7 : 1 },
            ]}
          >
            <Text style={[styles.createText, { color: colors.primary }]}>
              {creating ? t("projects.creating") : t("projects.create")}
            </Text>
          </Pressable>
        </View>
      }
      contentContainerStyle={styles.content}
    />
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: 8,
    paddingBottom: 96,
  },
  createButton: {
    minHeight: 44,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  createText: {
    fontSize: 16,
    fontWeight: "600",
  },
});
