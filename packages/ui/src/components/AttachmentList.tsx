import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { AttachmentMeta } from "@gtd/core";

import { useTheme } from "../hooks/useTheme";
import { AppText } from "../theme/AppText";
import { Button, IconButton } from "../theme/primitives";
import { useT } from "../i18n";
import { space } from "../theme/tokens";

export interface AttachmentListProps {
  items: AttachmentMeta[];
  /** 未提供则只读（移动端暂不支持选择文件） */
  onAdd?: () => void;
  onAddLabel?: string;
  onRemove: (id: string) => void;
  /** 打开附件（桌面端由壳层调系统默认程序） */
  onOpen?: (item: AttachmentMeta) => void;
}

/** 附件列表：文件名 + 大小；二进制在文件系统，库内只存元数据 */
export function AttachmentList({ items, onAdd, onAddLabel, onRemove, onOpen }: AttachmentListProps) {
  const colors = useTheme();
  const t = useT();

  return (
    <View style={styles.wrap}>
      {items.map((item) => (
        <View key={item.id} style={[styles.row, { borderColor: colors.border }]}>
          <Ionicons name="document-attach-outline" size={16} color={colors.textTertiary} />
          <View style={styles.meta}>
            <AppText variant="label" lines={1}>
              {item.fileName}
            </AppText>
            <AppText variant="caption" tone="tertiary" lines={1}>
              {formatSize(item.size)}
            </AppText>
          </View>
          {onOpen !== undefined ? (
            <IconButton
              icon="open-outline"
              size={16}
              onPress={() => onOpen(item)}
              accessibilityLabel={t("attachment.open")}
            />
          ) : null}
          <IconButton
            icon="close"
            size={15}
            tone="danger"
            onPress={() => onRemove(item.id)}
            accessibilityLabel={t("attachment.remove")}
          />
        </View>
      ))}

      {items.length === 0 ? (
        <AppText variant="caption" tone="tertiary" lines={2}>
          {t("attachment.empty")}
        </AppText>
      ) : null}

      {onAdd !== undefined ? (
        <Button
          label={onAddLabel ?? t("attachment.add")}
          icon="attach"
          size="sm"
          onPress={onAdd}
        />
      ) : null}
    </View>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const styles = StyleSheet.create({
  wrap: {
    gap: space.sm,
  },
  row: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
  },
  meta: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
});
