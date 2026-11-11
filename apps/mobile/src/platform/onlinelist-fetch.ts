/**
 * 从在线清单站点抓取数据（只读）。
 *
 * 这类站点的数据靠 WebSocket 推：连上 `<listId>/ws`，首条消息就是
 * `{ type: 'init', items, name, settings }`。收完立刻断开，不发送任何修改指令。
 *
 * 用 React Native 自带的 WebSocket（原生实现），不需要额外依赖。
 */
import { parseOnlinelistUrl } from "@gtd/core";

/** 默认 15 秒：分享页本身是秒开的，超时基本就是网络/站点问题 */
const DEFAULT_TIMEOUT_MS = 15_000;

export interface OnlinelistFetchResult {
  /** 站点返回的原始 init 载荷，交给 core 的 parseOnlinelistInit 解析 */
  payload: unknown;
  listId: string;
  shareUrl: string;
}

/** 抓取失败的原因，便于 UI 给出可操作的提示 */
export type OnlinelistFetchError =
  | "invalidUrl"
  | "unsupportedHost"
  | "timeout"
  | "network"
  | "badPayload";

export class OnlinelistFetchFailure extends Error {
  constructor(readonly kind: OnlinelistFetchError) {
    super(kind);
    this.name = "OnlinelistFetchFailure";
  }
}

export async function fetchOnlinelist(
  rawUrl: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<OnlinelistFetchResult> {
  const info = parseOnlinelistUrl(rawUrl);
  if (info === null) {
    // 区分「不是这个站点的链接」和「站点对但链接不完整」，提示更具体
    const looksLikeHost = /onlinelistmaker\.com/i.test(rawUrl);
    throw new OnlinelistFetchFailure(looksLikeHost ? "invalidUrl" : "unsupportedHost");
  }

  return await new Promise<OnlinelistFetchResult>((resolve, reject) => {
    let settled = false;
    let socket: WebSocket | null = null;

    const done = (
      result: { ok: true; value: OnlinelistFetchResult } | { ok: false; kind: OnlinelistFetchError },
    ) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket?.close();
      } catch {
        /* 已经关了就算了 */
      }
      if (result.ok) resolve(result.value);
      else reject(new OnlinelistFetchFailure(result.kind));
    };

    const timer = setTimeout(() => done({ ok: false, kind: "timeout" }), timeoutMs);

    try {
      socket = new WebSocket(info.wsUrl);
    } catch {
      done({ ok: false, kind: "network" });
      return;
    }

    socket.onmessage = (event) => {
      const raw = typeof event.data === "string" ? event.data : "";
      if (raw.length === 0) return;
      let payload: unknown;
      try {
        payload = JSON.parse(raw);
      } catch {
        done({ ok: false, kind: "badPayload" });
        return;
      }
      // 站点的首条消息是 init；如果先来了别的（例如 settings 变更），继续等 init
      const type = (payload as { type?: unknown } | null)?.type;
      if (typeof type === "string" && type !== "init") return;

      done({ ok: true, value: { payload, listId: info.listId, shareUrl: info.shareUrl } });
    };

    socket.onerror = () => done({ ok: false, kind: "network" });
    socket.onclose = () => {
      // 还没拿到数据就断开 → 当作网络失败
      done({ ok: false, kind: "network" });
    };
  });
}
