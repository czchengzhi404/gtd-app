import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useTheme } from "../hooks/useTheme";
import { AppText } from "../theme/AppText";
import { Button, IconButton } from "../theme/primitives";
import { useT } from "../i18n";
import { radius, space } from "../theme/tokens";

export interface PomodoroProps {
  /** 时长（分钟），默认 25 */
  minutes?: number;
  /** 一轮计时结束 */
  onComplete?: () => void;
}

/**
 * 番茄钟：25 分钟专注计时。
 * 用「目标时间戳 - 当前时间」计算剩余，避免定时器漂移；暂停时保留剩余毫秒。
 */
export function Pomodoro({ minutes = 25, onComplete }: PomodoroProps) {
  const colors = useTheme();
  const t = useT();
  const totalMs = minutes * 60 * 1000;
  const [remaining, setRemaining] = useState(totalMs);
  const [running, setRunning] = useState(false);
  const deadlineRef = useRef<number | null>(null);
  const firedRef = useRef(false);

  useEffect(() => {
    if (!running) return;
    deadlineRef.current = Date.now() + remaining;
    const id = setInterval(() => {
      const left = (deadlineRef.current ?? 0) - Date.now();
      if (left <= 0) {
        setRemaining(0);
        setRunning(false);
        if (!firedRef.current) {
          firedRef.current = true;
          onComplete?.();
        }
        return;
      }
      setRemaining(left);
    }, 250);
    return () => clearInterval(id);
    // remaining 刻意不进依赖：只在开始/暂停时重算 deadline
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  const mm = Math.floor(remaining / 60000);
  const ss = Math.floor((remaining % 60000) / 1000);
  const progress = 1 - remaining / totalMs;
  const done = remaining === 0;

  const reset = () => {
    setRunning(false);
    setRemaining(totalMs);
    firedRef.current = false;
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.top}>
        <View style={styles.labelRow}>
          <Ionicons name="timer-outline" size={15} color={colors.textTertiary} />
          <AppText variant="caption" tone="tertiary" lines={1}>
            {t("focus.pomodoro")}
          </AppText>
        </View>
        <AppText variant="display" lines={1} style={styles.clock}>
          {`${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`}
        </AppText>
        <View style={styles.actions}>
          <Button
            label={running ? t("focus.pause") : done ? t("focus.restart") : t("focus.start")}
            icon={running ? "pause" : "play"}
            variant={running ? "secondary" : "primary"}
            size="sm"
            onPress={() => {
              if (done) {
                reset();
                setRunning(true);
                return;
              }
              setRunning((v) => !v);
            }}
          />
          <IconButton
            icon="refresh"
            size={16}
            onPress={reset}
            accessibilityLabel={t("focus.reset")}
          />
        </View>
      </View>
      <View style={[styles.track, { backgroundColor: colors.surfaceMuted }]}>
        <View
          style={[
            styles.fill,
            {
              backgroundColor: done ? colors.success : colors.primary,
              width: `${Math.min(100, Math.round(progress * 100))}%` as never,
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: space.lg,
    marginTop: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: space.sm,
  },
  top: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xxs,
    flex: 1,
    minWidth: 0,
  },
  clock: {
    fontVariant: ["tabular-nums"],
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
  track: {
    height: 3,
    borderRadius: 2,
    overflow: "hidden",
  },
  fill: {
    height: 3,
  },
});
