import { useCallback, useEffect, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";

import { AppText, EmptyState, Screen, showUndo, useT } from "@gtd/ui";
import { getDeletedTasks, getSqliteExecutor, runCommand } from "@gtd/core";
import type { Task } from "@gtd/core";
import { Button, Divider } from "@gtd/ui";

/** 回收站：软删除的墓碑任务，可一键恢复 */
export default function TrashScreen() {
  const t = useT();
  const [items, setItems] = useState<Task[]>([]);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    const list = await getDeletedTasks(getSqliteExecutor()).catch(() => []);
    setItems(list);
    setLoaded(true);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const restore = async (task: Task) => {
    await runCommand("task.restore", { id: task.id }).catch(() => undefined);
    showUndo(t("trash.restored", { title: task.title }), () => {
      void runCommand("task.softDelete", { id: task.id }).catch(() => undefined);
    });
    await reload();
  };

  if (!loaded) {
    return (
      <Screen>
        <View />
      </Screen>
    );
  }

  if (items.length === 0) {
    return (
      <Screen>
        <EmptyState illustration="trash" title={t("trash.empty")} hint={t("trash.emptyHint")} />
      </Screen>
    );
  }

  return (
    <Screen>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.textWrap}>
              <AppText variant="body" lines={2}>
                {item.title}
              </AppText>
              <AppText variant="caption" tone="tertiary" lines={1}>
                {t("trash.deletedAt", { date: new Date(item.deletedAt ?? 0).toLocaleDateString() })}
              </AppText>
            </View>
            <Button
              label={t("trash.restore")}
              icon="refresh"
              variant="secondary"
              size="sm"
              onPress={() => void restore(item)}
            />
          </View>
        )}
        ItemSeparatorComponent={() => <Divider inset={16} />}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: 32,
    paddingHorizontal: 16,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
  },
  textWrap: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
});
