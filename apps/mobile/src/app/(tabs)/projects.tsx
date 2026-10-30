import { useMemo, useState } from "react";
import { router } from "expo-router";
import { SectionList, StyleSheet, View } from "react-native";

import {
  AppText,
  Button,
  EmptyState,
  OptionSheet,
  ProjectCard,
  showPrompt,
  showConfirm,
  useAppStore,
  useT,
} from "@gtd/ui";
import {
  appStore,
  getProjectNextAction,
  getProjectTasks,
  groupProjectsByArea,
  quickAdd,
  runCommand,
  selectActiveProjects,
  selectAreas,
} from "@gtd/core";
import type { Area, Project } from "@gtd/core";
import { useProjectActions } from "@/hooks/useRowActions";

interface Row {
  project: Project;
  openCount: number;
  nextActionTitle: string | null;
}

interface Group {
  key: string;
  title: string;
  area: Area | null;
  data: Row[];
}

/** 项目列表：按区域分组（未分组殿后），区域可新建/重命名/删除 */
export default function ProjectsScreen() {
  const areas = useAppStore(selectAreas);
  const activeProjects = useAppStore(selectActiveProjects);
  const loaded = useAppStore((s) => s.loaded);
  const t = useT();
  const actions = useProjectActions();
  const [creating, setCreating] = useState(false);
  const [areaSheet, setAreaSheet] = useState<Area | null>(null);

  // 分组对象每次新建，不能直接做 store selector（React #185）；这里以
  // 元素稳定的 areas/projects 数组为依赖在渲染期计算
  const grouped = useMemo(
    () => groupProjectsByArea(areas, activeProjects, appStore.getState().areas),
    [areas, activeProjects],
  );

  const sections = useMemo<Group[]>(() => {
    const state = appStore.getState();
    return grouped.map(({ area, projects }) => ({
      key: area?.id ?? "__loose__",
      title: area?.name ?? t("area.none"),
      area,
      data: projects.map((project) => {
        const tasks = getProjectTasks(state, project.id);
        return {
          project,
          openCount: tasks.filter((task) => task.status !== "done").length,
          nextActionTitle: getProjectNextAction(state, project.id)?.title ?? null,
        };
      }),
    }));
    // 未分组放在最后；其它有内容的区域按原顺序
  }, [grouped, t]);

  if (!loaded) return null;

  const visible = sections.filter((section) => section.data.length > 0 || section.area !== null);

  const createProject = async () => {
    setCreating(true);
    try {
      await quickAdd(`#P${Date.now().toString(36).slice(-4)}`, Date.now());
    } finally {
      setCreating(false);
    }
  };

  const createArea = async () => {
    const name = await showPrompt({
      title: t("area.create"),
      placeholder: t("area.namePlaceholder"),
      validate: (value) => (value.trim().length === 0 ? t("area.namePlaceholder") : null),
    });
    if (name === null || name.trim() === "") return;
    await runCommand("area.upsert", { name: name.trim() }).catch(() => undefined);
  };

  const renameArea = async (area: Area) => {
    const name = await showPrompt({ title: t("common.rename"), initialValue: area.name });
    if (name === null || name.trim() === "" || name.trim() === area.name) return;
    await runCommand("area.upsert", { id: area.id, name: name.trim() }).catch(() => undefined);
  };

  const deleteArea = async (area: Area) => {
    const ok = await showConfirm({
      title: t("area.deleteConfirm"),
      message: t("area.deleteConfirmBody", { name: area.name }),
      confirmLabel: t("common.delete"),
    });
    if (!ok) return;
    // 先把项目解绑，区域删除后项目回落到"未分组"
    const state = appStore.getState();
    const bound = Object.values(state.projects).filter(
      (project) => project.deletedAt === null && project.areaId === area.id,
    );
    for (const project of bound) {
      await runCommand("project.upsert", {
        id: project.id,
        name: project.name,
        areaId: null,
      }).catch(() => undefined);
    }
    await runCommand("area.softDelete", { id: area.id }).catch(() => undefined);
  };

  return (
    <View style={{ flex: 1 }}>
      <SectionList
        sections={visible}
        keyExtractor={(row) => row.project.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.content}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <AppText variant="label" tone="secondary" lines={1} style={styles.sectionTitle}>
              {section.title}
            </AppText>
            <AppText variant="caption" tone="tertiary" lines={1}>
              {`${section.data.length}`}
            </AppText>
            {section.area !== null ? (
              <Button
                label={t("common.edit")}
                size="sm"
                variant="ghost"
                onPress={() => setAreaSheet(section.area)}
              />
            ) : null}
          </View>
        )}
        renderItem={({ item }) => (
          <ProjectCard
            project={item.project}
            openCount={item.openCount}
            nextActionTitle={item.nextActionTitle}
            actions={actions}
            onPress={() => router.push(`/project/${item.project.id}`)}
          />
        )}
        renderSectionFooter={({ section }) =>
          section.data.length === 0 ? (
            <AppText variant="caption" tone="tertiary" lines={1} style={styles.emptyArea}>
              {t("projects.emptyHint")}
            </AppText>
          ) : null
        }
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
            <Button label={t("area.create")} icon="albums-outline" block variant="secondary" onPress={() => void createArea()} />
          </View>
        }
      />

      <OptionSheet
        visible={areaSheet !== null}
        title={areaSheet?.name}
        options={[
          { key: "rename", label: t("common.rename") },
          { key: "delete", label: t("common.delete"), danger: true },
        ]}
        onSelect={(key) => {
          const target = areaSheet;
          setAreaSheet(null);
          if (target === null) return;
          if (key === "rename") void renameArea(target);
          if (key === "delete") void deleteArea(target);
        }}
        onClose={() => setAreaSheet(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: 12,
    paddingBottom: 32,
    flexGrow: 1,
  },
  sectionHeader: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  sectionTitle: {
    flex: 1,
    minWidth: 0,
  },
  emptyArea: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    maxWidth: 760,
    alignSelf: "center",
  },
  footer: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 8,
  },
});
