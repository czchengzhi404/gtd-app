import { describe, expect, test } from "bun:test";

import {
  MD_MAX_DEPTH,
  parseInline,
  parseMarkdown,
  safeHttpUrl,
} from "../lib/markdown";

describe("parseMarkdown · 基础块", () => {
  test("标题只认 1–3 级，且 # 后必须有空格", () => {
    expect(parseMarkdown("# 一级")).toEqual([{ kind: "heading", level: 1, text: "一级" }]);
    expect(parseMarkdown("### 三级")).toEqual([{ kind: "heading", level: 3, text: "三级" }]);
    // #### 与 #标题 都不是标题
    expect(parseMarkdown("#### 四级")[0]?.kind).toBe("paragraph");
    expect(parseMarkdown("#标题")[0]?.kind).toBe("paragraph");
  });

  test("分隔线三种写法", () => {
    for (const mark of ["---", "***", "___"]) {
      expect(parseMarkdown(mark)).toEqual([{ kind: "divider" }]);
    }
  });

  test("空行被忽略，不产生空块", () => {
    expect(parseMarkdown("第一段\n\n\n第二段")).toHaveLength(2);
  });

  test("代码块内部不解析列表或标题", () => {
    const blocks = parseMarkdown("```\n- 不是列表\n# 不是标题\n```");
    expect(blocks).toEqual([{ kind: "code", text: "- 不是列表\n# 不是标题" }]);
  });

  test("未闭合的代码块也会输出（不吞内容）", () => {
    expect(parseMarkdown("```\n没收尾")).toEqual([{ kind: "code", text: "没收尾" }]);
  });
});

describe("parseMarkdown · 列表与嵌套", () => {
  test("无序列表带 depth=0", () => {
    expect(parseMarkdown("- 第一项")[0]).toEqual({ kind: "bullet", depth: 0, text: "第一项" });
  });

  test("缩进 2 空格 → depth 1，4 空格 → depth 2", () => {
    const blocks = parseMarkdown("- 顶层\n  - 第二层\n    - 第三层");
    expect(blocks.map((b) => (b.kind === "bullet" ? b.depth : -1))).toEqual([0, 1, 2]);
    expect(blocks.map((b) => (b.kind === "bullet" ? b.text : ""))).toEqual([
      "顶层",
      "第二层",
      "第三层",
    ]);
  });

  test("缩进超过 4 层被压到 MD_MAX_DEPTH", () => {
    const deep = `${"  ".repeat(10)}- 很深`;
    const block = parseMarkdown(deep)[0];
    expect(block?.kind).toBe("bullet");
    expect(block?.kind === "bullet" ? block.depth : -1).toBe(MD_MAX_DEPTH);
  });

  test("tab 按 2 空格计算", () => {
    const block = parseMarkdown("\t- tab 缩进")[0];
    expect(block?.kind === "bullet" ? block.depth : -1).toBe(1);
  });

  test("有序列表保留原始序号", () => {
    const blocks = parseMarkdown("1. 甲\n2. 乙\n7. 丙");
    expect(blocks).toEqual([
      { kind: "ordered", depth: 0, index: 1, text: "甲" },
      { kind: "ordered", depth: 0, index: 2, text: "乙" },
      { kind: "ordered", depth: 0, index: 7, text: "丙" },
    ]);
  });

  test("有序列表支持 `1)` 写法", () => {
    expect(parseMarkdown("1) 括号写法")[0]).toEqual({
      kind: "ordered",
      depth: 0,
      index: 1,
      text: "括号写法",
    });
  });

  test("任务清单带完成态与 depth", () => {
    expect(parseMarkdown("- [ ] 未做")[0]).toEqual({
      kind: "task",
      depth: 0,
      done: false,
      text: "未做",
    });
    expect(parseMarkdown("- [x] 已做")[0]).toEqual({
      kind: "task",
      depth: 0,
      done: true,
      text: "已做",
    });
    expect(parseMarkdown("  - [X] 缩进已做")[0]).toEqual({
      kind: "task",
      depth: 1,
      done: true,
      text: "缩进已做",
    });
  });

  test("列表与有序列表可以混排", () => {
    const kinds = parseMarkdown("- 无序\n1. 有序\n  - 嵌套无序").map((b) => b.kind);
    expect(kinds).toEqual(["bullet", "ordered", "bullet"]);
  });

  test("`-` 后面没空格不算列表", () => {
    expect(parseMarkdown("-不是列表")[0]?.kind).toBe("paragraph");
  });

  test("数字后缺空格不算有序列表", () => {
    expect(parseMarkdown("1.没有空格")[0]?.kind).toBe("paragraph");
  });
});

describe("parseMarkdown · 引用与段落", () => {
  test("引用去掉 > 与前导空格", () => {
    expect(parseMarkdown("> 引用内容")[0]).toEqual({ kind: "quote", text: "引用内容" });
  });

  test("普通文本是段落", () => {
    expect(parseMarkdown("就是一段话")[0]).toEqual({ kind: "paragraph", text: "就是一段话" });
  });
});

describe("parseInline · 行内格式", () => {
  test("粗体", () => {
    expect(parseInline("前**重点**后")).toEqual([
      { text: "前" },
      { text: "重点", bold: true },
      { text: "后" },
    ]);
  });

  test("斜体", () => {
    expect(parseInline("*斜*")).toEqual([{ text: "斜", italic: true }]);
  });

  test("行内代码优先级高于粗体", () => {
    expect(parseInline("`**不是粗体**`")).toEqual([{ text: "**不是粗体**", code: true }]);
  });

  test("链接解析出 url", () => {
    expect(parseInline("[官网](https://example.com)")).toEqual([
      { text: "官网", link: "https://example.com" },
    ]);
  });

  test("未闭合标记按普通文本处理（不吞内容）", () => {
    expect(parseInline("**没有收尾")).toEqual([{ text: "**没有收尾" }]);
  });

  test("空串返回一个空片段", () => {
    expect(parseInline("")).toEqual([{ text: "" }]);
  });
});

describe("safeHttpUrl", () => {
  test("只放行 http/https", () => {
    expect(safeHttpUrl("https://a.com")).toBe("https://a.com");
    expect(safeHttpUrl("http://a.com")).toBe("http://a.com");
  });

  test("拒绝 javascript: 与 data:", () => {
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl("data:text/html,x")).toBeNull();
  });

  test("大小写不敏感", () => {
    expect(safeHttpUrl("HTTPS://A.COM")).toBe("HTTPS://A.COM");
  });

  test("前后空白被裁掉", () => {
    expect(safeHttpUrl("  https://a.com  ")).toBe("https://a.com");
  });
});
