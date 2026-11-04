import { describe, expect, test } from "bun:test";

import {
  detectImportFormat,
  normalizeImportPriority,
  parseCSVRows,
  parseGenericCSV,
  parseImportDate,
  parseImportText,
  parseMarkdownTasks,
  parseTickTickCSV,
  parseTodoistCSV,
} from "../features/importers";

const NOW = new Date(2026, 10, 2, 10, 0, 0, 0).getTime();

describe("Markdown 导入", () => {
  test("标题分组 + 复选框任务 + 完成态", () => {
    const plan = parseMarkdownTasks(
      ["# 工作", "- [ ] 写周报", "- [x] 回邮件", "## 生活", "- [ ] 买牛奶"].join("\n"),
      NOW,
    );
    expect(plan.format).toBe("markdown");
    expect(plan.projects).toEqual(["工作", "生活"]);
    expect(plan.tasks.map((task) => task.title)).toEqual(["写周报", "回邮件", "买牛奶"]);
    expect(plan.tasks[1]?.completed).toBe(true);
    expect(plan.tasks[0]?.projectName).toBe("工作");
    expect(plan.tasks[2]?.projectName).toBe("生活");
  });

  test("复用快速添加语法：@情境 +标签 !优先级 明天", () => {
    const plan = parseMarkdownTasks("- [ ] 给张总发周报 @电脑 +本周 !! 明天", NOW);
    const task = plan.tasks[0];
    expect(task?.title).toBe("给张总发周报");
    expect(task?.contextNames).toEqual(["电脑"]);
    expect(task?.tags).toEqual(["本周"]);
    expect(task?.priority).toBe(2);
    expect(task?.dueAt).toBe(new Date(2026, 10, 3, 18, 0, 0, 0).getTime());
  });

  test("缩进列表行并入上一条任务笔记", () => {
    const plan = parseMarkdownTasks(
      ["- [ ] 准备演示", "  - 导出数据", "  - 检查投影"].join("\n"),
      NOW,
    );
    expect(plan.tasks).toHaveLength(1);
    expect(plan.tasks[0]?.notes).toBe("- 导出数据\n- 检查投影");
  });

  test("空标题与无内容行被跳过，不产生空任务", () => {
    const plan = parseMarkdownTasks(["- [ ]   ", "", "随便一段话"].join("\n"), NOW);
    expect(plan.tasks).toHaveLength(0);
    expect(plan.skipped).toBe(2);
  });

  test("去掉标题里的多余空白", () => {
    const plan = parseMarkdownTasks("- [ ]   写   周报   ", NOW);
    expect(plan.tasks[0]?.title).toBe("写 周报");
  });
});

describe("CSV 解析器", () => {
  test("引号字段、字段内逗号与换行、双引号转义", () => {
    const rows = parseCSVRows('a,"b,c","line1\nline2","say ""hi"""\r\n1,2,3,4');
    expect(rows[0]).toEqual(["a", "b,c", "line1\nline2", 'say "hi"']);
    expect(rows[1]).toEqual(["1", "2", "3", "4"]);
  });

  test("末尾无换行也能解析最后一行", () => {
    expect(parseCSVRows("a,b\nc,d")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });
});

describe("Todoist CSV 导入", () => {
  const csv = [
    "TYPE,CONTENT,DESCRIPTION,PRIORITY,DUE DATE,LABELS,PROJECT",
    'task,"写周报","季度总结",1,2026-11-05,"工作,重要",工作',
    "task,买牛奶,,4,,,生活",
    "note,一条笔记,,,,,",
    'task,"含逗号, 的任务",,2,2026-02-30,,',
  ].join("\n");

  test("只导入 task 行；优先级映射；标签拆分；项目收集", () => {
    const plan = parseTodoistCSV(csv, NOW);
    expect(plan.format).toBe("todoist");
    expect(plan.tasks).toHaveLength(3);
    expect(plan.skipped).toBe(1);
    const first = plan.tasks[0];
    expect(first?.title).toBe("写周报");
    expect(first?.notes).toBe("季度总结");
    expect(first?.priority).toBe(3);
    expect(first?.dueAt).toBe(new Date(2026, 10, 5, 18, 0, 0, 0).getTime());
    expect(first?.tags).toEqual(["工作", "重要"]);
    expect(first?.projectName).toBe("工作");
    expect(plan.tasks[1]?.priority).toBe(0);
    expect(plan.tasks[2]?.title).toBe("含逗号, 的任务");
  });

  test("非法日期被忽略（2 月 30 日），不阻断整行", () => {
    const plan = parseTodoistCSV(csv, NOW);
    expect(plan.tasks[2]?.dueAt).toBeNull();
  });

  test("缺少 CONTENT 列 → 空计划 + 警告", () => {
    const plan = parseTodoistCSV("TYPE,FOO\ntask,bar", NOW);
    expect(plan.tasks).toHaveLength(0);
    expect(plan.warnings.length).toBeGreaterThan(0);
  });
});

describe("格式识别与统一入口", () => {
  test("识别 Todoist / Markdown / 未知", () => {
    expect(detectImportFormat("TYPE,CONTENT\n task,x")).toBe("todoist");
    expect(detectImportFormat("- [ ] 任务")).toBe("markdown");
    expect(detectImportFormat("# 只有标题")).toBe("markdown");
    expect(detectImportFormat("普通文本")).toBe("unknown");
  });

  test("识别 TickTick（TITLE + LIST）与通用 CSV（TITLE）", () => {
    expect(detectImportFormat("Title,List,Content\n买菜,生活,")).toBe("ticktick");
    expect(detectImportFormat("标题,清单,内容\n买菜,生活,")).toBe("ticktick");
    expect(detectImportFormat("Title,Notes\n买菜,备注")).toBe("generic");
  });

  test("parseImportText 自动分派", () => {
    const md = parseImportText("- [ ] A\n- [ ] B", NOW);
    expect(md.tasks).toHaveLength(2);
    const csvPlan = parseImportText("TYPE,CONTENT\ntask,A", NOW);
    expect(csvPlan.format).toBe("todoist");
    const ticktick = parseImportText("Title,List\n买菜,生活", NOW);
    expect(ticktick.tasks).toHaveLength(1);
    const unknown = parseImportText("随便写点什么", NOW);
    expect(unknown.tasks).toHaveLength(0);
    expect(unknown.warnings).toHaveLength(1);
  });

  test("parseImportDate 支持日期与日期时间，无时刻默认 18:00", () => {
    expect(parseImportDate("2026-11-05")).toBe(new Date(2026, 10, 5, 18, 0).getTime());
    expect(parseImportDate("2026-11-05 09:30")).toBe(new Date(2026, 10, 5, 9, 30).getTime());
    expect(parseImportDate("2026-11-05T09:30:00")).toBe(new Date(2026, 10, 5, 9, 30).getTime());
    expect(parseImportDate("明天")).toBeNull();
    expect(parseImportDate("2026-13-01")).toBeNull();
  });
});

describe("TickTick CSV 与通用映射", () => {
  const ticktick = [
    "Folder,List,Title,Content,Priority,Due Date,Tags,Status",
    '工作,季度目标,"写 Q4 复盘","含三个部分",高,2026-11-10,"复盘,重要",未完成',
    '生活,采购,买牛奶,,低,,,已完成',
    "工作,季度目标,,,,,,未完成",
  ].join("\n");

  test("TickTick：列映射、优先级中文、标签、完成态", () => {
    const plan = parseTickTickCSV(ticktick, NOW);
    expect(plan.format).toBe("ticktick");
    expect(plan.tasks).toHaveLength(2);
    const first = plan.tasks[0];
    expect(first?.title).toBe("写 Q4 复盘");
    expect(first?.notes).toBe("含三个部分");
    expect(first?.priority).toBe(3);
    expect(first?.dueAt).toBe(new Date(2026, 10, 10, 18, 0).getTime());
    expect(first?.tags).toEqual(["复盘", "重要"]);
    expect(first?.projectName).toBe("季度目标");
    expect(plan.tasks[1]?.priority).toBe(1);
    expect(plan.tasks[1]?.completed).toBe(true);
    // 空标题行被跳过
    expect(plan.skipped).toBe(1);
  });

  test("优先级归一化覆盖 Todoist P1–P4 / TickTick 0–3 / 英文", () => {
    expect(normalizeImportPriority("P1")).toBe(3);
    expect(normalizeImportPriority("P4")).toBe(0);
    expect(normalizeImportPriority("高")).toBe(3);
    expect(normalizeImportPriority("Medium")).toBe(2);
    expect(normalizeImportPriority("none")).toBe(0);
    expect(normalizeImportPriority("")).toBeNull();
  });

  test("通用 CSV：显式列映射生效", () => {
    const csv = ["Task,Detail,Level,When,Labels,Bucket", "写方案,细节,High,2026-11-08,客户,A 项目"].join("\n");
    const plan = parseGenericCSV(csv, NOW, {
      title: "Task",
      notes: "Detail",
      priority: "Level",
      due: "When",
      tags: "Labels",
      project: "Bucket",
    });
    expect(plan.format).toBe("generic");
    expect(plan.tasks[0]?.title).toBe("写方案");
    expect(plan.tasks[0]?.notes).toBe("细节");
    expect(plan.tasks[0]?.priority).toBe(3);
    expect(plan.tasks[0]?.tags).toEqual(["客户"]);
    expect(plan.tasks[0]?.projectName).toBe("A 项目");
  });

  test("通用 CSV 缺少标题列时给出警告而不是抛错", () => {
    const plan = parseGenericCSV("A,B\n1,2", NOW, { title: "Missing" });
    expect(plan.tasks).toHaveLength(0);
    expect(plan.warnings[0]).toContain("Missing");
  });
});
