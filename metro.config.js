const path = require("path");

const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

config.resolver.assetExts = [...config.resolver.assetExts, "wasm"];

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === "web" && moduleName === "react-native-view-shot") {
    return { type: "sourceFile", filePath: path.resolve(__dirname, "src/lib/viewShotWeb.ts") };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
