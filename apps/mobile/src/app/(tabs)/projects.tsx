import { useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";

import { Button, EmptyState, ProjectCard, useAppStore, useT } from "@gtd/ui";
import {
  appStore,
  getProjectNextAction,
  getProjectTasks,
  quickAdd,
  selectActiveProjects,
} from "@gtd/core";
import { useProjectActions } from "@/hooks/useRowActions";

/** 项目：卡片列表 + 新建。新建走快速添加语法（#名称） */
export default function ProjectsScreen() {
  const projects = useAppStore(selectActiveProjects);
  const loaded = useAppStore((s) => s.loaded);
  const [creating, setCreating] = useState(false);
  const t = useT();
  const projectActions = useProjectActions();

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
      contentContainerStyle={styles.content}
      renderItem={({ item }) => {
        const state = appStore.getState();
        const openTasks = getProjectTasks(state, item.id).filter((task) => task.status !== "done");
        const next = getProjectNextAction(state, item.id);
        return (
          <ProjectCard
            project={item}
            openCount={openTasks.length}
            nextActionTitle={next?.title ?? null}
            actions={projectActions}
            onPress={() => undefined}
          />
        );
      }}
      ListEmptyComponent={<EmptyState icon="folder-open-outline" title={t("projects.emptyTitle")} hint={t("projects.emptyHint")} />}
      ListFooterComponent={
        <View style={styles.footer}>
          <Button
            label={creating ? t("projects.creating") : t("projects.create")}
            icon="add"
            variant="secondary"
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
  },
  footer: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    paddingHorizontal: 16,
    paddingTop: 8,
  },
});
