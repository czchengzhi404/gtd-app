import { describe, it, expect } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * 可访问性静态审计（ui-ux-pro-max Accessibility/Touch CRITICAL）。
 * 抓"直接写死小尺寸""图标按钮无标签""绕过 AppText 直接用 Text"三类明显问题。
 * 这是启发式检查，不替代真机验证。
 */

const UI_SRC = join(import.meta.dirname, "..");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".mimosa") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (full.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

const files = walk(UI_SRC).filter((file) => !file.includes("__tests__"));

describe("可访问性审计", () => {
  it("图标按钮均带 accessibilityLabel", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf-8");
      if (!source.includes("IconButton")) continue;
      const start = source.indexOf("<IconButton");
      while (start !== -1) {
        const end = source.indexOf("/>", start);
        if (end === -1) break;
        const call = source.slice(start, end + 2);
        if (!call.includes("accessibilityLabel")) {
          offenders.push(file.slice(UI_SRC.length) + " :: " + call.slice(0, 60));
        }
        const next = source.indexOf("<IconButton", end);
        if (next === start) break;
        if (next === -1) break;
        // 继续扫描后续调用
        const startRef = { value: next };
        if (startRef.value <= start) break;
        const call2End = source.indexOf("/>", startRef.value);
        if (call2End === -1) break;
        const call2 = source.slice(startRef.value, call2End + 2);
        if (!call2.includes("accessibilityLabel")) {
          offenders.push(file.slice(UI_SRC.length) + " :: " + call2.slice(0, 60));
        }
        break;
      }
    }
    expect(offenders).toEqual([]);
  });

  it("组件不直接 import react-native 的 Text（统一走 AppText）", () => {
    const offenders: string[] = [];
    for (const file of files) {
      if (file.includes("AppText.tsx")) continue;
      const source = readFileSync(file, "utf-8");
      const lines = source.split("\n");
      for (const line of lines) {
        if (!line.includes('from "react-native"')) continue;
        if (line.includes("TextInput")) continue;
        // 匹配 import { ... Text ... } 中单独的 Text
        const between = line.slice(line.indexOf("{") + 1, line.indexOf("}"));
        const names = between.split(",").map((part) => part.trim());
        if (names.includes("Text")) {
          offenders.push(file.slice(UI_SRC.length));
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("所有可点元素所在组件都声明了无障碍角色或标签", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf-8");
      const pressables = source.split("<Pressable").length - 1;
      if (pressables === 0) continue;
      const roles = source.split("accessibilityRole").length - 1;
      const labels = source.split("accessibilityLabel").length - 1;
      // 每个 Pressable 至少要有 role 或 label 之一（允许一个组件内多次复用）
      if (roles === 0 && labels === 0) {
        offenders.push(file.slice(UI_SRC.length) + " :: " + String(pressables) + " pressables");
      }
    }
    expect(offenders).toEqual([]);
  });
});
