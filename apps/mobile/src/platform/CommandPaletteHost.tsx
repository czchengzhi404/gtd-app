import { useCallback, useMemo } from "react";
import { router } from "expo-router";
import { useStore } from "zustand";
import { CommandPalette, useAppStore, useKeyboardShortcuts } from "@gtd/ui";
import { getAllTasks, quickAdd } from "@gtd/core";

import { closePalette, openPalette, paletteStore, togglePalette } from "./palette-store";

/**
 * 全局命令面板宿主：挂在根布局，覆盖所有路由（含任务详情）。
 *
 * 打开方式：
 * - 桌面菜单 Cmd/Ctrl+K（主进程发 menu:action → bootstrap 调 togglePalette）
 * - 渲染层键盘 Cmd/Ctrl+K（浏览器/Electron 窗口内，无需菜单）
 *
 * 移动端**故意不提供**这个弹层：手机上已有「更多 → 搜索」的整页版全局搜索（`/search`），
 * 带范围切换、命中高亮和最近搜索，能力是它的超集。
 * （此处原注释写「移动端右上角搜索图标」，但 PageHeader 并没有 onSearch，注释是过期的。）
 */
export function CommandPaletteHost() {
  const visible = useStore(paletteStore, (state) => state.visible);
  const tasks = useAppStore(getAllTasks);
  const projects = useAppStore((state) => Object.values(state.projects));

  const activeTasks = useMemo(() => tasks.filter((task) => task.deletedAt === null), [tasks]);
  const activeProjects = useMemo(
    () => projects.filter((project) => project.deletedAt === null && project.status !== "done"),
    [projects],
  );

  const shortcuts = useMemo(() => [{ key: "k", modifier: "ctrl" as const }, { key: "Escape" }], []);

  const onKey = useCallback((key: string) => {
    if (key.toLowerCase() === "escape") {
      closePalette();
      return;
    }
    togglePalette();
  }, []);

  useKeyboardShortcuts(shortcuts, onKey);

  return (
    <CommandPalette
      visible={visible}
      tasks={activeTasks}
      projects={activeProjects}
      onClose={closePalette}
      onOpenTask={(id) => router.push(`/task/${id}`)}
      onOpenProject={(id) => router.push(`/project/${id}`)}
      onCreateTask={(title) => {
        void quickAdd(title, Date.now())
          .then(() => router.navigate("/"))
          .catch(() => undefined);
      }}
    />
  );
}

export { openPalette, closePalette, togglePalette };
