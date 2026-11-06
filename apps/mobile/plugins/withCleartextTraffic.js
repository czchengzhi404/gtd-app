const { withAndroidManifest, withInfoPlist } = require("@expo/config-plugins");

/**
 * 允许明文 HTTP（自托管 WebDAV / 局域网同步）。
 *
 * 为什么需要：Android 9（API 28）起默认禁止明文 HTTP，`http://192.168.x.x:8080`
 * 这类自托管地址会直接抛 `ERR_CLEARTEXT_NOT_PERMITTED`；桌面端（Electron）没有这个
 * 限制，于是表现成「电脑能同步、手机不能」——但错误信息往往只显示「网络错误」，
 * 很难定位。
 *
 * iOS 同理：ATS 默认拒绝 http，需要在 Info.plist 里放开。
 *
 * 取舍：全局放开明文属于安全降级（同网络下可被嗅探）。这个应用的同步目标是
 * 用户自建的网盘/服务器，且默认推荐 https（坚果云就是 https），因此接受该取舍；
 * 设置页会提示优先使用 https。
 */
module.exports = function withCleartextTraffic(config) {
  const withAndroid = withAndroidManifest(config, (cfg) => {
    const application = cfg.modResults?.manifest?.application?.[0];
    if (application !== undefined) {
      application.$ = application.$ ?? {};
      application.$["android:usesCleartextTraffic"] = "true";
    }
    return cfg;
  });

  return withInfoPlist(withAndroid, (cfg) => {
    cfg.modResults.NSAppTransportSecurity = {
      ...(cfg.modResults.NSAppTransportSecurity ?? {}),
      NSAllowsArbitraryLoads: true,
    };
    return cfg;
  });
};
