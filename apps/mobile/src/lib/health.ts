/**
 * 最小网络模块（阶段一硬验收①的一部分）。
 *
 * 目的：验证 Expo Router 的 static rendering 在 Bun + 本项目代码结构下稳定
 * （模板内含该模块的 import，导出时会真实走一次模块加载）。
 *
 * 纪律：同步客户端一律基于 fetch 自行实现（WebDAV/自托管/HTTP 端点），
 * 不引入 axios——SDK 57 下 Bun + axios（follow-redirects 触发 Babel
 * Error.prepareStackTrace 交互缺陷）会导致 expo export 的 static rendering
 * 阶段失败。此文件存在本身就是对"fetch 方式可行"的持续验证。
 */
export interface PingResult {
  ok: boolean;
  status?: number;
  error?: string;
}

export async function ping(url: string, timeoutMs = 5000): Promise<PingResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: "HEAD", signal: controller.signal });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}
