const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// expo-sqlite web 实现 import .wasm 资产（Electron 壳内运行时不会走该路径，
// 但 Metro 需要能解析它）；默认 assetExts 不含 wasm。
config.resolver.assetExts.push("wasm");

module.exports = config;
