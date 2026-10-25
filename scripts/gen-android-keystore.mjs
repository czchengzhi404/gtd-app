// 生成 Android release 签名密钥库（PKCS12）。幂等：已存在则跳过。
// 本机无 JDK，用 Git Bash 自带 openssl 生成；密码存 keys/keystore.env（不入 git？——
// 私有个人仓库随库保存以稳定签名，见 README）。
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const keysDir = path.resolve(import.meta.dirname, "..", "apps", "mobile", "keys");
const ksPath = path.join(keysDir, "gtd-release.p12");
fs.mkdirSync(keysDir, { recursive: true });

if (fs.existsSync(ksPath)) {
  console.log("[gen-keystore] 已存在，跳过:", ksPath);
  process.exit(0);
}

const password = execSync("openssl rand -hex 16", { encoding: "utf-8" }).trim();
if (!/^[0-9a-f]{32}$/.test(password)) throw new Error("密码生成异常");

const keyPem = path.join(keysDir, "tmp-key.pem");
const certPem = path.join(keysDir, "tmp-cert.pem");
try {
  execSync(
    `openssl req -x509 -newkey rsa:2048 -keyout "${keyPem}" -out "${certPem}" ` +
      `-days 10950 -nodes -subj "/CN=GTD List/O=Personal/C=CN" -passout pass:${password}`,
    { stdio: "pipe" },
  );
  execSync(
    `openssl pkcs12 -export -inkey "${keyPem}" -in "${certPem}" -out "${ksPath}" ` +
      `-name gtd -passout pass:${password} -legacy || openssl pkcs12 -export -inkey "${keyPem}" -in "${certPem}" -out "${ksPath}" -name gtd -passout pass:${password}`,
    { stdio: "pipe" },
  );
} finally {
  fs.rmSync(keyPem, { force: true });
  fs.rmSync(certPem, { force: true });
}
fs.writeFileSync(path.join(keysDir, "keystore.env"), `GTD_KEYSTORE_PASSWORD=${password}\n`);
console.log("[gen-keystore] 生成完成:", ksPath);
