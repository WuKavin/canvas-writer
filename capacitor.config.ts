import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.kavin.canvaswriter.mobile",
  appName: "Canvas Writer",
  webDir: "dist/renderer",
  server: {
    androidScheme: "https"
  }
};

export default config;
