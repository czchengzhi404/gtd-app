/**
 * 校验 withJsonImportIntent 插件产出的 intent-filter 是否符合预期。
 * 不跑 prebuild，直接调用插件函数，避免为了看一眼 manifest 改动等几分钟。
 *
 * 注意：@expo/config-plugins 把 mod 存成**函数**（`config.mods.android.manifest(modConfig)`），
 * 不是 `{ action: [...] }`，这里按函数调用。
 *
 * 用法：node bench/check-json-intent-plugin.mjs
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const plugin = require("../apps/mobile/plugins/withJsonImportIntent.js");

const cfg = plugin({ mods: { android: {} } });
const mod = cfg.mods?.android?.manifest;
if (typeof mod !== "function") {
  console.error("插件没有注册 android.manifest 修改器，实际类型:", typeof mod);
  process.exit(1);
}

const fake = {
  modResults: {
    manifest: {
      application: [
        {
          $: { "android:name": ".Application" },
          activity: [{ $: { "android:name": ".MainActivity", "android:exported": "true" } }],
        },
      ],
    },
  },
};

// mod 是 async 的：新版 config-plugins 里 mod 返回 Promise
const out = await mod(fake);
const activity = out.modResults.manifest.application[0].activity[0];
const filters = activity["intent-filter"] ?? [];

console.log(`intent-filter 数量: ${filters.length}`);
for (const f of filters) {
  const actions = f.action.map((a) => a.$["android:name"].split(".").pop());
  const cats = f.category.map((c) => c.$["android:name"].split(".").pop());
  const data = f.data.map((d) => `${d.$["android:scheme"]}:${d.$["android:mimeType"]}`);
  console.log(`  action=${actions.join(",")}  category=${cats.join(",")}`);
  for (const d of data) console.log(`    data ${d}`);
}

const ok =
  filters.length === 1 &&
  filters[0].action[0].$["android:name"] === "android.intent.action.VIEW" &&
  filters[0].category.some((c) => c.$["android:name"] === "android.intent.category.DEFAULT") &&
  filters[0].data.some(
    (d) => d.$["android:mimeType"] === "application/json" && d.$["android:scheme"] === "content",
  ) &&
  filters[0].data.some(
    (d) => d.$["android:mimeType"] === "application/json" && d.$["android:scheme"] === "file",
  );

console.log(`MainActivity exported = ${activity.$["android:exported"]}`);

// 幂等：再跑一次不应该重复追加
const twice = await mod(out);
const count2 = twice.modResults.manifest.application[0].activity[0]["intent-filter"].length;
console.log(`重复执行后 intent-filter 数量: ${count2}（应仍为 1）`);

// 没有 MainActivity 时应该安静跳过，不抛异常
const noMain = await mod({
  modResults: { manifest: { application: [{ $: {}, activity: [{ $: { "android:name": ".Other" } }] }] } },
});
console.log("缺 MainActivity 时不崩溃:", noMain !== undefined);

if (!ok) {
  console.error("FAIL: intent-filter 不符合预期");
  process.exit(1);
}
if (count2 !== 1) {
  console.error("FAIL: 插件不幂等");
  process.exit(1);
}
console.log("\n校验通过 ✅");
