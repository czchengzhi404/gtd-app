import { useMemo, useState } from "react";
import { router } from "expo-router";
import { ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  AppText,
  Badge,
  Button,
  Card,
  Divider,
  EmptyState,
  IconButton,
  PageHeader,
  Screen,
  Sheet,
  SectionHeader,
  showConfirm,
  showToast,
  radius,
  space,
  useAppStore,
  useTheme,
  useT,
} from "@gtd/ui";
import { runCommand, selectActiveProjects } from "@gtd/core";

/**
 * 任务模板：可复用的任务骨架（标题/笔记/优先级/项目/情境/标签/清单/重复）。
 *
 * 入口：任务详情「另存为模板」创建；本页查看、直接实例化、删除。
 * 实例化走 `template.instantiate`（单事务建任务，checklist 子项重新生成 id），
 * 模板本身 revision 不变——复用不会污染模板。
 */
export default function TemplatesScreen() {
  const colors = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const templates = useAppStore((s) => s.templates);
  const projects = useAppStore(selectActiveProjects);

  const [formOpen, setFormOpen] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [busy, setBusy] = useState(false);

  const list = useMemo(
    () =>
      Object.values(templates)
        .filter((template) => template.deletedAt === null)
        .sort((a, b) => b.createdAt - a.createdAt),
    [templates],
  );

  const projectName = (projectId: string | null): string | null => {
    if (projectId === null) return null;
    const project = projects.find((candidate) => candidate.id === projectId);
    return project?.name ?? null;
  };

  const useTemplate = async (templateId: string) => {
    try {
      const result = await runCommand("template.instantiate", { id: templateId });
      const record = result.records[0]?.record;
      showToast({ message: t("template.created"), tone: "success" });
      if (record !== undefined) router.push(`/task/${record.id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      showToast({ message: t("template.useFailed", { message }), tone: "danger" });
    }
  };

  const removeTemplate = async (templateId: string, name: string) => {
    const ok = await showConfirm({
      title: t("template.deleteConfirm"),
      message: t("template.deleteConfirmBody", { name }),
      confirmLabel: t("common.delete"),
    });
    if (!ok) return;
    try {
      await runCommand("template.softDelete", { id: templateId });
      showToast({ message: t("template.deleted", { name }), tone: "default" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      showToast({ message: t("template.useFailed", { message }), tone: "danger" });
    }
  };

  const createTemplate = async () => {
    if (draftName.trim().length === 0 || draftTitle.trim().length === 0) return;
    setBusy(true);
    try {
      await runCommand("template.upsert", {
        name: draftName.trim(),
        title: draftTitle.trim(),
      });
      setFormOpen(false);
      setDraftName("");
      setDraftTitle("");
      showToast({ message: t("template.saved"), tone: "success" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      showToast({ message: t("template.useFailed", { message }), tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <PageHeader
        title={t("template.title")}
        subtitle={t("template.subtitle", { n: list.length })}
        onBack={() => router.back()}
        backLabel={t("template.title")}
        actions={
          <IconButton
            icon="add"
            variant="filled"
            onPress={() => setFormOpen(true)}
            accessibilityLabel={t("template.create")}
          />
        }
      />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xxxl }]}
      >
        {list.length === 0 ? (
          <EmptyState
            title={t("template.emptyTitle")}
            hint={t("template.emptyHint")}
            action={{
              label: t("template.create"),
              onPress: () => setFormOpen(true),
            }}
          />
        ) : (
          <>
            <SectionHeader title={t("template.section")} />
            {list.map((template) => {
              const project = projectName(template.projectId);
              return (
                <Card key={template.id} variant="outline" padding="normal" style={styles.card}>
                  <View style={styles.cardHeader}>
                    <AppText variant="subtitle" lines={1} style={styles.flex}>
                      {template.name}
                    </AppText>
                    <IconButton
                      icon="trash-outline"
                      tone="danger"
                      size="sm"
                      onPress={() => void removeTemplate(template.id, template.name)}
                      accessibilityLabel={t("template.deleteA11y", { name: template.name })}
                    />
                  </View>
                  <AppText variant="label" tone="secondary" lines={2}>
                    {template.title}
                  </AppText>
                  <View style={styles.badges}>
                    {template.priority > 0 ? (
                      <Badge label={`P${template.priority}`} tone="warning" />
                    ) : null}
                    {project !== null ? <Badge label={`#${project}`} /> : null}
                    {template.checklist.length > 0 ? (
                      <Badge
                        label={t("template.checklistCount", { n: template.checklist.length })}
                      />
                    ) : null}
                    {template.recurrence !== null ? (
                      <Badge label={t("template.recurring")} tone="info" />
                    ) : null}
                  </View>
                  <Divider variant="section" />
                  <Button
                    label={t("template.use")}
                    icon="add-circle-outline"
                    variant="secondary"
                    size="sm"
                    onPress={() => void useTemplate(template.id)}
                  />
                </Card>
              );
            })}
          </>
        )}
      </ScrollView>

      <Sheet
        visible={formOpen}
        title={t("template.create")}
        onClose={() => setFormOpen(false)}
        actions={
          <Button
            label={t("common.save")}
            variant="primary"
            block
            loading={busy}
            disabled={draftName.trim().length === 0 || draftTitle.trim().length === 0}
            onPress={() => void createTemplate()}
          />
        }
      >
        <AppText variant="caption" tone="tertiary" lines={2}>
          {t("template.createHint")}
        </AppText>
        <View style={styles.formGap} />
        <AppText variant="label" tone="secondary" lines={1}>
          {t("template.name")}
        </AppText>
        <TextInput
          value={draftName}
          onChangeText={setDraftName}
          placeholder={t("template.namePlaceholder")}
          placeholderTextColor={colors.textTertiary}
          accessibilityLabel={t("template.name")}
          style={[
            styles.input,
            { color: colors.text, backgroundColor: colors.surfaceMuted, borderColor: colors.border },
          ]}
        />
        <View style={styles.formGap} />
        <AppText variant="label" tone="secondary" lines={1}>
          {t("template.taskTitle")}
        </AppText>
        <TextInput
          value={draftTitle}
          onChangeText={setDraftTitle}
          placeholder={t("template.taskTitlePlaceholder")}
          placeholderTextColor={colors.textTertiary}
          accessibilityLabel={t("template.taskTitle")}
          style={[
            styles.input,
            { color: colors.text, backgroundColor: colors.surfaceMuted, borderColor: colors.border },
          ]}
        />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: space.lg,
    gap: space.sm,
    maxWidth: 880,
    width: "100%",
    alignSelf: "center",
  },
  card: {
    gap: space.sm,
    marginBottom: space.sm,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  flex: {
    flex: 1,
    minWidth: 0,
  },
  badges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.xs,
  },
  formGap: {
    height: space.sm,
  },
  input: {
    minHeight: 44,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    fontSize: 16,
  },
});
