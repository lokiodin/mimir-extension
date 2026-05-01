import path from "path";
import { fileURLToPath } from "url";
import CopyWebpackPlugin from "copy-webpack-plugin";
import { merge } from "webpack-merge";
import common from "./webpack.common.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default merge(common, {
  mode: "production",
  output: {
    path: path.resolve(__dirname, "dist/firefox"),
    filename: "[name].js",
    clean: true,
  },
  plugins: [
    new CopyWebpackPlugin({
      patterns: [
        {
          from: path.resolve(__dirname, "manifest.firefox.json"),
          to: "manifest.json",
        },
        {
          from: path.resolve(__dirname, "icons"),
          to: "icons",
        },
      ],
    }),
  ],
});
