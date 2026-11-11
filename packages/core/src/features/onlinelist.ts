/**
 * 在线清单（onlinelistmaker.com）导入。
 *
 * 这类网站的数据**不在 HTML 里**：分享页是个客户端渲染的壳，数据靠 WebSocket 推。
 * 从它自己的前端代码里读出来的协议：
 *
 *   const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
 *   new WebSocket(protocol + '//' + location.host + '/' + LIST_ID + '/ws')
 *   首条消息：{ type: 'init', items: [{ id, text, checked }], name, settings }
 *
 * 所以「网站导入」= 打开这个 WebSocket、收首条 init、关掉。
 * 只读：不发送任何 add / toggle / delete。
 *
 * 本文件只做**纯逻辑**（URL 解析 + 载荷 → 导入计划），不碰网络，
 * 网络那一步在 `apps/mobile/src/platform/onlinelist-fetch.ts`。
 */
import { IMPORT_TASK_LIMIT, type ImportPlan, type ImportTaskDraft } from "./importers";

/** 支持的主机名（目前只有这一家；加新站点时在这里扩） */
export const ONLINELIST_HOSTS = ["onlinelistmaker.com", "www.onlinelistmaker.com"];

export interface OnlinelistUrlInfo {
  host: string;
  listId: string;
  /** 分享页地址（去掉查询串与末尾斜杠） */
  shareUrl: string;
  /** 该站点的 WebSocket 端点 */
  wsUrl: string;
}

/**
 * 从分享链接里取出清单 id 并推导 WebSocket 地址。
 *
 * 只接受「主机在名单里 + 路径恰好一段 + 形如清单 id」的地址，
 * 否则返回 null 让调用方提示用户，而不是拿一个乱七八糟的路径去连 WebSocket。
 */
export function parseOnlinelistUrl(raw: string): OnlinelistUrlInfo | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase();
  if (!ONLINELIST_HOSTS.includes(host)) return null;

  const segments = url.pathname.split("/").filter((part) => part.length > 0);
  if (segments.length !== 1) return null;

  const listId = segments[0]!;
  // 清单 id 是大小写字母+数字，长度 6~64；排除 og/xxx.png 这类静态资源路径
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(listId)) return null;

  const canonicalHost = "onlinelistmaker.com";
  return {
    host,
    listId,
    shareUrl: `https://${canonicalHost}/${listId}`,
    wsUrl: `wss://${canonicalHost}/${listId}/ws`,
  };
}

interface RawItem {
  id?: unknown;
  text?: unknown;
  checked?: unknown;
  completed?: unknown;
  need?: unknown;
  claims?: unknown;
}

interface RawInit {
  type?: unknown;
  name?: unknown;
  items?: unknown;
}

/** 认领记录（signup 模式）：`{ name, note }` */
function describeClaims(claims: unknown): string[] {
  if (!Array.isArray(claims)) return [];
  const lines: string[] = [];
  for (const claim of claims) {
    if (claim === null || typeof claim !== "object") continue;
    const c = claim as { name?: unknown; note?: unknown };
    const name = typeof c.name === "string" ? c.name.trim() : "";
    const note = typeof c.note === "string" ? c.note.trim() : "";
    if (name.length === 0 && note.length === 0) continue;
    lines.push(note.length > 0 ? `${name}：${note}` : name);
  }
  return lines;
}

/**
 * 把 init 消息转成导入计划。
 *
 * 与其它导入器一致：不落库、不生成 id，只输出草稿；
 * 单条脏数据跳过并计入 skipped/warnings，不因一条坏数据让整次导入失败。
 */
export function parseOnlinelistInit(payload: unknown, now: number): ImportPlan {
  const warnings: string[] = [];
  const tasks: ImportTaskDraft[] = [];
  let skipped = 0;

  const init = (payload ?? {}) as RawInit;
  if (typeof init.type === "string" && init.type !== "init") {
    warnings.push(`意料之外的消息类型：${init.type}`);
  }

  const rawName = typeof init.name === "string" ? init.name.trim() : "";
  const projectName = rawName.length > 0 ? rawName : "在线清单";

  const items = Array.isArray(init.items) ? (init.items as RawItem[]) : [];
  if (!Array.isArray(init.items)) warnings.push("载荷里没有 items 数组");

  for (const item of items) {
    if (tasks.length >= IMPORT_TASK_LIMIT) {
      warnings.push(`超过 ${IMPORT_TASK_LIMIT} 条上限，剩余条目已忽略`);
      break;
    }
    if (item === null || typeof item !== "object") {
      skipped += 1;
      continue;
    }
    const title = typeof item.text === "string" ? item.text.trim() : "";
    if (title.length === 0) {
      skipped += 1;
      continue;
    }

    const completed = item.checked === true || item.completed === true;

    // 备注只放「本来就在原清单里的信息」，不塞我们自己的东西：
    // signup 模式下有认领人和所需份数，list 模式下是空的。
    const noteLines: string[] = [];
    const need = typeof item.need === "number" ? item.need : null;
    if (need !== null && need > 1) noteLines.push(`需要 ${need} 份`);
    const claims = describeClaims(item.claims);
    if (claims.length > 0) noteLines.push(...claims.map((c) => `认领：${c}`));

    tasks.push({
      title,
      notes: noteLines.join("\n"),
      completed,
      status: "next",
      priority: 0,
      dueAt: null,
      projectName,
      contextNames: [],
      tags: [],
    });
  }

  if (items.length > 0 && tasks.length === 0) {
    warnings.push("所有条目都是空的，没有可导入的内容");
  }

  // now 仅用于将来可能的时间字段；保留参数以与其它解析器签名一致
  void now;

  return {
    format: "onlinelist",
    tasks,
    projects: tasks.length > 0 ? [projectName] : [],
    skipped,
    warnings,
  };
}
