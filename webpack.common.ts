import path from "path";
import { fileURLToPath } from "url";
import HtmlWebpackPlugin from "html-webpack-plugin";
import type { Configuration } from "webpack";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const common: Configuration = {
  entry: {
    popup: path.resolve(__dirname, "src/surfaces/popup.tsx"),
    window: path.resolve(__dirname, "src/surfaces/window.tsx"),
    background: path.resolve(__dirname, "src/background/index.ts"),
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: {
          loader: "ts-loader",
          options: {
            configFile: "tsconfig.build.json",
          },
        },
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: ["style-loader", "css-loader", "postcss-loader"],
      },
    ],
  },
  resolve: {
    extensions: [".tsx", ".ts", ".js"],
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: path.resolve(__dirname, "src/surfaces/popup.html"),
      filename: "popup.html",
      chunks: ["popup"],
    }),
    new HtmlWebpackPlugin({
      template: path.resolve(__dirname, "src/surfaces/window.html"),
      filename: "window.html",
      chunks: ["window"],
    }),
  ],
};

export default common;
