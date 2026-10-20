import * as stylex from "@stylexjs/stylex";

/** 画面部品の高さ（px）。地図の padding・Toast の位置合わせに使う。stylex.create 内から参照できるよう defineConsts */
export const layout = stylex.defineConsts({
  peek: 80, // BottomSheet ピーク時の高さ
  navbar: 64, // NavBar
  hud: 88, // NavHud 本体（バナー除く）
  next: 36, // NavHud 「その先」行
});
