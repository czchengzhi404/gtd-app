import { useMemo, useState } from "react";
import { router } from "expo-router";
import { FlatList, StyleSheet, View } from "react-native";

import { Button, EmptyState, ProjectCard, useAppStore, useT } from "@gtd/ui";
import { appStore, getProjectNextAction, getProjectTasks, quickAdd, selectActiveProjects } from "@gtd/core";
import { useProjectActions } from "@/hooks/useRowActions";

/** 项目列表：点击卡片进入项目详情 */
export default function ProjectsScreen() {
  const projects = useAppStore(selectActiveProjects);
  const loaded = useAppStore((s) => s.loaded);
  const t = useT();
  const actions = useProjectActions();
  const [creating, setCreating] = useState(false);

  const rows = useMemo(
    () =>
      projects.map((project) => {
        const state = appStore.getState();
        const tasks = getProjectTasks(state, project.id);
        return {
          project,
          openCount: tasks.filter((task) => task.status !== "done").length,
          nextAction: getProjectNextAction(state, project.id),
        };
      }),
    [projects],
  );

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
      data={rows}
      keyExtractor={(row) => row.project.id}
      contentContainerStyle={styles.content}
      renderItem={({ item }) => (
        <ProjectCard
          project={item.project}
          openCount={item.openCount}
          nextActionTitle={item.nextAction?.title ?? null}
          actions={actions}
          onPress={() => router.push(`/project/${item.project.id}`)}
        />
      )}
      ListEmptyComponent={
        <EmptyState icon="folder-open-outline" title={t("projects.emptyTitle")} hint={t("projects.emptyHint")} />
      }
      ListFooterComponent={
        <View style={styles.footer}>
          <Button
            label={creating ? t("projects.creating") : t("projects.create")}
            icon="add"
            block
            disabled={creating}
            onPress={() => void createProject()}
          />
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: 12,
    paddingBottom: 32,
    flexGrow: 1,
  },
  footer: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    paddingHorizontal: 16,
    paddingTop: 8,
  },
});
