import { describe, expect, test } from "bun:test";

import { describePeerDevices, shortDeviceId } from "../sync/devices";
import type { Manifest, SyncProvider } from "../sync/types";

type FakeMap = Record<string, Manifest>;

function makeProvider(manifests: FakeMap): SyncProvider {
  return {
    listDevices: async () => Object.keys(manifests),
    readManifest: async (deviceId) => manifests[deviceId] ?? null,
    writeManifest: async () => undefined,
    readRecords: async () => [],
    writeRecords: async () => undefined,
  };
}

describe("shortDeviceId", () => {
  test("取末 6 位并小写，忽略连字符", () => {
    expect(shortDeviceId("0192a4c1-7f3e-7abc-8def-0123456789ab")).toBe("6789ab");
  });

  test("短 id 原样保留", () => {
    expect(shortDeviceId("abc123")).toBe("abc123");
  });
});

describe("describePeerDevices", () => {
  test("排除自己，记录数取 manifest 条目数，最后活动取最大 updatedAt", async () => {
    const provider = makeProvider({
      self: { a: { revision: 1, updatedAt: 5_000, deletedAt: null } },
      phone: {
        a: { revision: 2, updatedAt: 1_000, deletedAt: null },
        b: { revision: 1, updatedAt: 9_000, deletedAt: null },
      },
      laptop: { c: { revision: 1, updatedAt: 3_000, deletedAt: null } },
    });

    const peers = await describePeerDevices(provider, "self");
    expect(peers.map((peer) => peer.id)).toEqual(["phone", "laptop"]);
    expect(peers[0]).toMatchObject({ recordCount: 2, lastActivityAt: 9_000 });
    expect(peers[1]).toMatchObject({ recordCount: 1, lastActivityAt: 3_000 });
  });

  test("空 manifest 的设备记录数为 0、活动时间为 null，排在最后", async () => {
    const provider = makeProvider({
      self: {},
      empty: {},
      other: { x: { revision: 1, updatedAt: 100, deletedAt: null } },
    });
    const peers = await describePeerDevices(provider, "self");
    expect(peers.map((peer) => peer.id)).toEqual(["other", "empty"]);
    expect(peers[1]).toMatchObject({ recordCount: 0, lastActivityAt: null });
  });

  test("读不到 manifest 的设备被跳过，不影响其他设备", async () => {
    const provider = makeProvider({
      self: {},
      broken: {},
      good: { a: { revision: 1, updatedAt: 42, deletedAt: null } },
    });
    provider.readManifest = async (deviceId) => {
      if (deviceId === "broken") throw new Error("corrupt");
      return deviceId === "good" ? { a: { revision: 1, updatedAt: 42, deletedAt: null } } : null;
    };
    const peers = await describePeerDevices(provider, "self");
    expect(peers.map((peer) => peer.id)).toEqual(["good"]);
  });
});
