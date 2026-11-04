const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
const workspaceRoot = path.resolve(__dirname, "../..");

// expo-sqlite web 实现 import .wasm 资产（Electron 壳内运行时不会走该路径，
// 但 Metro 需要能解析它）；默认 assetExts 不含 wasm。
config.resolver.assetExts.push("wasm");

// Bun hoisted linker 把 workspace 包以 Windows junction 链到根 node_modules；
// Metro 的 resolver 在部分 Windows 环境读不到 junction 目标，直接把 @gtd/*
// 指向真实源码目录（同时保留符号链接跟随作为兜底）。
config.resolver.unstable_enableSymlinks = true;
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules ?? {}),
  "@gtd/ui": path.join(workspaceRoot, "packages/ui"),
  "@gtd/core": path.join(workspaceRoot, "packages/core"),
};

module.exports = config;
