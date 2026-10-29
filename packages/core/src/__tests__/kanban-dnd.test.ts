import { describe, it, expect } from "bun:test";
import { hitColumn, resolveDrop, exceedsDragThreshold } from "../features/kanban-dnd";

const RECTS = [
  { key: "inbox", x: 0, width: 272 },
  { key: "next", x: 280, width: 272 },
  { key: "waiting", x: 560, width: 272 },
  { key: "someday", x: 840, width: 272 },
];

describe("看板拖拽落点", () => {
  it("命中列内任意位置", () => {
    expect(hitColumn(RECTS, 100)).toBe("inbox");
    expect(hitColumn(RECTS, 400)).toBe("next");
    expect(hitColumn(RECTS, 900)).toBe("someday");
  });

  it("列间空隙与列外返回 null", () => {
    expect(hitColumn(RECTS, 276)).toBeNull();
    expect(hitColumn(RECTS, -10)).toBeNull();
    expect(hitColumn(RECTS, 2000)).toBeNull();
  });

  it("边界值归入所属列", () => {
    expect(hitColumn(RECTS, 0)).toBe("inbox");
    expect(hitColumn(RECTS, 272)).toBe("inbox");
    expect(hitColumn(RECTS, 280)).toBe("next");
  });

  it("resolveDrop：同列返回 null（不产生无意义写入）", () => {
    expect(resolveDrop("inbox", 100, RECTS)).toBeNull();
  });

  it("resolveDrop：跨列返回目标 key", () => {
    expect(resolveDrop("inbox", 400, RECTS)).toBe("next");
    expect(resolveDrop("next", 900, RECTS)).toBe("someday");
  });

  it("resolveDrop：落在空隙/列外不改变状态", () => {
    expect(resolveDrop("inbox", 276, RECTS)).toBeNull();
    expect(resolveDrop("inbox", 5000, RECTS)).toBeNull();
  });

  it("拖拽阈值：微小位移不触发", () => {
    expect(exceedsDragThreshold(3, 3)).toBe(false);
    expect(exceedsDragThreshold(7, 0)).toBe(true);
    expect(exceedsDragThreshold(0, -9)).toBe(true);
  });
});
