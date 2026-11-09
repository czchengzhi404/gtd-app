const { withAndroidManifest } = require("@expo/config-plugins");

/**
 * 让 App 出现在「用其他应用打开」列表里，并能接住别处传进来的 .json。
 *
 * 为什么需要：微信里收到的 .json 存在它自己的私有目录
 * （`Android/data/com.tencent.mm/...`），Android 11+ 不允许别的应用读那里。
 * 用户只能先在微信里「用其他应用打开」把文件交给系统文件管理器，存到公共目录，
 * 再回 App 里通过 SAF 选择器一层层找。注册这个 intent-filter 之后，
 * 微信的「用其他应用打开」会直接列出 GTD List，点一下就能导入。
 *
 * 只注册 ACTION_VIEW：
 * - ACTION_VIEW 对应「用其他应用打开」/ 文件管理器里点开文件，数据在 intent data 里，
 *   RN 的 `Linking.getInitialURL()` 能直接拿到；
 * - ACTION_SEND（「分享到」）的文件在 `EXTRA_STREAM` 里，RN 没有暴露读取接口，
 *   要接就得写原生模块。与其做一个半残的入口，不如不注册，避免用户点进来什么也没发生。
 *
 * mimeType 只放 `application/json`：`text/plain`、`application/octet-stream` 会让
 * 打开任意 .txt / 未知类型文件时都冒出本应用，属于骚扰。微信分享 .json 时按扩展名
 * 判定就是 application/json；万一遇到别的类型，App 内的「从 JSON 导入」仍然可用。
 */
const MIME_TYPES = ["application/json"];

function buildIntentFilter(mimeType) {
  return {
    action: [{ $: { "android:name": "android.intent.action.VIEW" } }],
    category: [
      { $: { "android:name": "android.intent.category.DEFAULT" } },
      // BROWSABLE 让文件管理器/下载列表也能把文件递过来
      { $: { "android:name": "android.intent.category.BROWSABLE" } },
    ],
    data: [
      // content:// —— 别的应用用 FileProvider 分享文件时的标准形态
      { $: { "android:scheme": "content", "android:mimeType": mimeType } },
      // file:// —— 少数旧应用/终端工具仍然给文件路径
      { $: { "android:scheme": "file", "android:mimeType": mimeType } },
    ],
  };
}

module.exports = function withJsonImportIntent(config) {
  return withAndroidManifest(config, (cfg) => {
    const application = cfg.modResults?.manifest?.application?.[0];
    if (application === undefined) return cfg;

    const activities = application.activity ?? [];
    // 主 Activity：expo-router 生成的入口类名固定是 .MainActivity
    const main = activities.find((a) => a.$?.["android:name"] === ".MainActivity");
    if (main === undefined) {
      console.warn("[withJsonImportIntent] 没找到 .MainActivity，跳过");
      return cfg;
    }

    main["intent-filter"] = main["intent-filter"] ?? [];
    const already = main["intent-filter"].some((f) =>
      (f.data ?? []).some((d) => d.$?.["android:mimeType"] === "application/json"),
    );
    if (!already) {
      for (const mimeType of MIME_TYPES) {
        main["intent-filter"].push(buildIntentFilter(mimeType));
      }
    }
    return cfg;
  });
};
