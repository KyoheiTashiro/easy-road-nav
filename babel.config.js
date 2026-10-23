// StyleX と React Compiler のコンパイル設定。vite.config.ts と @stylexjs/postcss-plugin の両方が読む
import styleX from "@stylexjs/babel-plugin";
import reactCompiler from "babel-plugin-react-compiler";

export default {
  parserOpts: { plugins: ["typescript", "jsx"] },
  plugins: [
    reactCompiler, // 公式指定: 他のプラグインより先に実行する
    [
      styleX,
      {
        dev: process.env.NODE_ENV !== "production",
        runtimeInjection: false,
        unstable_moduleResolution: { type: "commonJS", rootDir: import.meta.dirname },
        aliases: { "@/*": [`${import.meta.dirname}/src/*`] },
      },
    ],
  ],
};
