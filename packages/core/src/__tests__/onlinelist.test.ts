import { describe, expect, test } from "bun:test";

import { parseOnlinelistInit, parseOnlinelistUrl } from "../features/onlinelist";

const NOW = 1_700_000_000_000;

describe("parseOnlinelistUrl", () => {
  test("标准分享链接", () => {
    const info = parseOnlinelistUrl("https://onlinelistmaker.com/IfhTbvvgQfR5mvqd");
    expect(info).not.toBeNull();
    expect(info!.listId).toBe("IfhTbvvgQfR5mvqd");
    expect(info!.wsUrl).toBe("wss://onlinelistmaker.com/IfhTbvvgQfR5mvqd/ws");
    expect(info!.shareUrl).toBe("https://onlinelistmaker.com/IfhTbvvgQfR5mvqd");
  });

  test("容忍末尾斜杠、查询串、片段、www、http、缺协议", () => {
    for (const raw of [
      "https://onlinelistmaker.com/IfhTbvvgQfR5mvqd/",
      "https://onlinelistmaker.com/IfhTbvvgQfR5mvqd?ref=wx",
      "https://onlinelistmaker.com/IfhTbvvgQfR5mvqd#top",
      "https://www.onlinelistmaker.com/IfhTbvvgQfR5mvqd",
      "http://onlinelistmaker.com/IfhTbvvgQfR5mvqd",
      "onlinelistmaker.com/IfhTbvvgQfR5mvqd",
      "   https://onlinelistmaker.com/IfhTbvvgQfR5mvqd   ",
    ]) {
      const info = parseOnlinelistUrl(raw);
      expect(info, raw).not.toBeNull();
      expect(info!.listId, raw).toBe("IfhTbvvgQfR5mvqd");
    }
  });

  test("拒绝别的站点", () => {
    expect(parseOnlinelistUrl("https://example.com/IfhTbvvgQfR5mvqd")).toBeNull();
    // 相似域名不能混进来
    expect(parseOnlinelistUrl("https://onlinelistmaker.com.evil.io/IfhTbvvgQfR5mvqd")).toBeNull();
  });

  test("拒绝没有清单 id 的地址", () => {
    expect(parseOnlinelistUrl("https://onlinelistmaker.com/")).toBeNull();
    expect(parseOnlinelistUrl("https://onlinelistmaker.com")).toBeNull();
    expect(parseOnlinelistUrl("https://onlinelistmaker.com/a/b")).toBeNull();
    expect(parseOnlinelistUrl("https://onlinelistmaker.com/og/IfhTbvvgQfR5mvqd.png")).toBeNull();
  });

  test("拒绝空串与垃圾输入", () => {
    expect(parseOnlinelistUrl("")).toBeNull();
    expect(parseOnlinelistUrl("   ")).toBeNull();
    expect(parseOnlinelistUrl("不是链接")).toBeNull();
  });
});

describe("parseOnlinelistInit", () => {
  test("真实载荷（26 条）转成导入计划", () => {
    const payload = {
      type: "init",
      name: "军师欠下的999件事",
      settings: { mode: "list", surprise: false },
      items: [
        { id: 1794280378577, text: "又幻想了做短剧赚大钱", checked: false },
        { id: 1793674898837, text: "那我的黄果计划怎么办", checked: false },
        { id: 1792773134817, text: "去上海听死亡搁浅音乐会", checked: true },
      ],
    };
    const plan = parseOnlinelistInit(payload, NOW);
    expect(plan.format).toBe("onlinelist");
    expect(plan.tasks).toHaveLength(3);
    expect(plan.projects).toEqual(["军师欠下的999件事"]);
    expect(plan.skipped).toBe(0);
    expect(plan.warnings).toEqual([]);

    expect(plan.tasks[0]!.title).toBe("又幻想了做短剧赚大钱");
    expect(plan.tasks[0]!.completed).toBe(false);
    expect(plan.tasks[0]!.status).toBe("next");
    expect(plan.tasks[0]!.projectName) .toBe("军师欠下的999件事");

    // 勾选过的那条要保留完成状态
    expect(plan.tasks[2]!.completed).toBe(true);
  });

  test("没有 name 时用默认项目名", () => {
    const plan = parseOnlinelistInit({ type: "init", items: [{ text: "a" }] }, NOW);
    expect(plan.projects).toEqual(["在线清单"]);
    expect(plan.tasks[0]!.projectName).toBe("在线清单");
  });

  test("空文本条目计入 skipped，不产生任务", () => {
    const plan = parseOnlinelistInit(
      { type: "init", name: "x", items: [{ text: "  " }, { text: "有效" }, { nope: 1 }, null] },
      NOW,
    );
    expect(plan.tasks).toHaveLength(1);
    expect(plan.skipped).toBe(3);
  });

  test("全空清单给出 warning 且不建项目", () => {
    const plan = parseOnlinelistInit({ type: "init", name: "x", items: [{ text: "" }] }, NOW);
    expect(plan.tasks).toHaveLength(0);
    expect(plan.projects).toEqual([]);
    expect(plan.warnings.length).toBeGreaterThan(0);
  });

  test("没有 items 数组时给 warning", () => {
    const plan = parseOnlinelistInit({ type: "init", name: "x" }, NOW);
    expect(plan.tasks).toHaveLength(0);
    expect(plan.warnings.join()).toContain("items");
  });

  test("非 init 消息类型要提示", () => {
    const plan = parseOnlinelistInit({ type: "state", items: [{ text: "a" }] }, NOW);
    expect(plan.warnings.join()).toContain("state");
  });

  test("signup 模式的认领信息进备注", () => {
    const plan = parseOnlinelistInit(
      {
        type: "init",
        name: "聚餐",
        items: [
          { text: "可乐", need: 3, claims: [{ name: "小王", note: "两瓶" }] },
          { text: "纸巾", need: 1, claims: [] },
        ],
      },
      NOW,
    );
    expect(plan.tasks[0]!.notes).toContain("需要 3 份");
    expect(plan.tasks[0]!.notes).toContain("认领：小王：两瓶");
    // need 为 1 不写「需要 1 份」，避免噪声
    expect(plan.tasks[1]!.notes).toBe("");
  });

  test("超长标题被原样保留（上限由写库时裁剪）", () => {
    const long = "汉".repeat(500);
    const plan = parseOnlinelistInit({ type: "init", name: "x", items: [{ text: long }] }, NOW);
    expect(plan.tasks[0]!.title.length).toBe(500);
  });
});
