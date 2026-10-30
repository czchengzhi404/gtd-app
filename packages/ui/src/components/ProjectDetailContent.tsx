import { ScrollView, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Area, Project, Section, Task } from "@gtd/core";

import { SectionHeader } from "./Screen";
import { TaskRow } from "./TaskRow";
import { EmptyState } from "./EmptyState";
import { Chip } from "./Chip";
import { AppText } from "../theme/AppText";
import { Card, Divider } from "../theme/primitives";
import { useTheme } from "../hooks/useTheme";
import { useT } from "../i18n";
import { radius, space } from "../theme/tokens";

export interface ProjectDetailContentProps {
  project: Project;
  sections: Section[];
  tasks: Task[];
  /** 顺序项目的下一个行动 id（高亮） */
  nextActionId: string | null;
  now: number;
  onToggleTask: (task: Task) => void;
  onPressTask: (task: Task) => void;
  /** 区域列表（传入方可修改归属） */
  areas?: Area[];
  onSetArea?: (areaId: string | null) => void;
}

/** 项目详情：进度 + 所属区域 + 按 section 分组的任务 + 下一步行动高亮 */
export function ProjectDetailContent({
  project,
  sections,
  tasks,
  nextActionId,
  now,
  onToggleTask,
  onPressTask,
  areas,
  onSetArea,
}: ProjectDetailContentProps) {
  const colors = useTheme();
  const t = useT();

  const open = tasks.filter((task) => task.status !== "done");
  const done = tasks.length - open.length;
  const percent = tasks.length === 0 ? 0 : Math.round((done / tasks.length) * 100);

  const groups: { key: string; title: string | null; items: Task[] }[] = [];
  const grouped = new Set<string>();

  for (const section of sections) {
    const items = open.filter((task) => task.sectionId === section.id);
    for (const task of items) grouped.add(task.id);
    groups.push({ key: section.id, title: section.name, items });
  }
  const loose = open.filter((task) => !grouped.has(task.id));
  groups.unshift({ key: "__none__", title: null, items: loose });

  return (
    <ScrollView contentContainerStyle={styles.content} style={{ backgroundColor: colors.canvas }}>
      <View style={styles.column}>
        <Card style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={[styles.kindPill, { backgroundColor: colors.surfaceMuted }]}>
              <AppText variant="caption" tone="tertiary" lines={1}>
                {t(project.kind === "sequential" ? "projects.sequential" : "projects.parallel")}
              </AppText>
            </View>
            <AppText variant="caption" tone="tertiary" lines={1}>
              {t("projects.openCount", { n: open.length })}
            </AppText>
          </View>

          <AppText variant="title" lines={2}>
            {project.name}
          </AppText>
          {project.description.length > 0 ? (
            <AppText variant="label" tone="secondary" lines={3}>
              {project.description}
            </AppText>
          ) : null}

          <View style={styles.progressRow}>
            <View style={[styles.track, { backgroundColor: colors.surfaceMuted }]}>
              <View
                style={[
                  styles.fill,
                  { backgroundColor: percent === 100 ? colors.success : colors.primary, width: `${percent}%` as never },
                ]}
              />
            </View>
            <AppText variant="caption" tone="tertiary" lines={1}>
              {`${percent}%`}
            </AppText>
          </View>

          {onSetArea !== undefined && areas !== undefined ? (
            <View style={styles.areaRow}>
              <AppText variant="caption" tone="tertiary" lines={1}>
                {t("area.assign")}
              </AppText>
              <View style={styles.areaChips}>
                <Chip
                  label={t("area.none")}
                  prefix={null}
                  selected={project.areaId === null}
                  onPress={() => onSetArea(null)}
                />
                {areas.map((area) => (
                  <Chip
                    key={area.id}
                    label={area.name}
                    prefix={null}
                    selected={project.areaId === area.id}
                    onPress={() => onSetArea(area.id)}
                  />
                ))}
              </View>
            </View>
          ) : null}
        </Card>

        {tasks.length === 0 ? (
          <EmptyState icon="list-outline" title={t("project.empty")} hint={t("project.emptyHint")} />
        ) : (
          groups.map((group) => {
            if (group.items.length === 0 && group.title !== null) return null;
            return (
              <View key={group.key}>
                {group.title !== null ? <SectionHeader title={group.title} /> : null}
                {group.items.length === 0 ? (
                  <AppText variant="caption" tone="tertiary" lines={1} style={styles.groupEmpty}>
                    {t("project.groupEmpty")}
                  </AppText>
                ) : null}
                {group.items.map((task) => (
                  <View
                    key={task.id}
                    style={
                      task.id === nextActionId
                        ? [styles.nextWrap, { backgroundColor: colors.primaryMuted }]
                        : undefined
                    }
                  >
                    <TaskRow
                      title={task.title}
                      done={task.status === "done"}
                      onToggle={() => onToggleTask(task)}
                      onPress={() => onPressTask(task)}
                      meta={
                        task.id === nextActionId ? (
                          <View style={styles.nextTag}>
                            <Ionicons name="arrow-forward-circle" size={12} color={colors.primary} />
                            <AppText variant="caption" color={colors.primary} lines={1}>
                              {t("project.nextAction")}
                            </AppText>
                          </View>
                        ) : undefined
                      }
                    />
                  </View>
                ))}
                <Divider />
              </View>
            );
          })
        )}

        {done > 0 ? (
          <>
            <SectionHeader title={t("project.doneSection")} />
            {tasks
              .filter((task) => task.status === "done")
              .slice(0, 10)
              .map((task) => (
                <TaskRow
                  key={task.id}
                  title={task.title}
                  done
                  onToggle={() => onToggleTask(task)}
                  onPress={() => onPressTask(task)}
                />
              ))}
          </>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: space.xxxl,
  },
  column: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
  },
  hero: {
    margin: space.lg,
    gap: space.sm,
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  kindPill: {
    height: 20,
    paddingHorizontal: space.sm,
    borderRadius: radius.xs,
    justifyContent: "center",
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingTop: space.xxs,
  },
  track: {
    flex: 1,
    height: 5,
    borderRadius: 3,
    overflow: "hidden",
  },
  fill: {
    height: 5,
  },
  groupEmpty: {
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
  },
  areaRow: {
    gap: space.xs,
    paddingTop: space.xs,
  },
  areaChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.xs,
  },
  nextWrap: {
    marginHorizontal: space.sm,
    borderRadius: radius.sm,
    borderLeftWidth: 3,
    borderLeftColor: "#2563EB",
  },
  nextTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xxs,
    height: 20,
  },
});
