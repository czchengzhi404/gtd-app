import https from "node:https";

/**
 * 探测各 GitHub 镜像对 Range 请求的可用性。
 * 用法：node bench/probe-mirrors.mjs <tag> <arch>
 */
const tag = process.argv[2] ?? "v2.7.5";
const arch = process.argv[3] ?? "x86_64";
const file = `GTD-${tag}-${arch}.apk`;
const github = `https://github.com/czchengzhi404/gtd-app/releases/download/${tag}/${file}`;

const mirrors = [
  (u) => `https://ghproxy.net/${u}`,
  (u) => `https://gh-proxy.com/${u}`,
  (u) => `https://ghfast.top/${u}`,
  (u) => `https://hub.gitmirror.com/${u}`,
  (u) => `https://mirror.ghproxy.com/${u}`,
  (u) => `https://ghproxy.cc/${u}`,
  (u) => u, // 直连
];

function probe(url, depth = 0) {
  return new Promise((resolve) => {
    const req = https.get(
      url,
      { timeout: 25_000, headers: { Range: "bytes=0-1023", "User-Agent": "gtd-probe" } },
      (res) => {
        const { statusCode, headers } = res;
        if (statusCode && statusCode >= 300 && statusCode < 400 && headers.location && depth < 4) {
          res.resume();
          probe(new URL(headers.location, url).toString(), depth + 1).then(resolve);
          return;
        }
        let bytes = 0;
        res.on("data", (c) => (bytes += c.length));
        res.on("end", () => resolve({ statusCode, bytes }));
        res.on("error", () => resolve({ statusCode, bytes }));
      },
    );
    req.on("socket", (s) => s.on("error", () => undefined));
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", (e) => resolve({ error: e.message }));
  });
}

for (const make of mirrors) {
  const url = make(github);
  const host = new URL(url).host;
  const result = await probe(url);
  const ok = result.statusCode === 206 || result.statusCode === 200;
  console.log(
    `${ok ? "OK  " : "FAIL"} ${host.padEnd(24)} status=${result.statusCode ?? "-"} bytes=${result.bytes ?? 0}${result.error ? " " + result.error : ""}`,
  );
}
