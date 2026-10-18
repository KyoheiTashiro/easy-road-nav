// StyleX のコンパイル設定。@vitejs/plugin-react（configFile: true）と @stylexjs/postcss-plugin の両方が読む
import styleX from "@stylexjs/babel-plugin";

export default {
  parserOpts: { plugins: ["typescript", "jsx"] },
  plugins: [
    [
      styleX,
      {
        dev: process.env.NODE_ENV !== "production",
        runtimeInjection: false,
        unstable_moduleResolution: { type: "commonJS", rootDir: import.meta.dirname },
      },
    ],
  ],
};
