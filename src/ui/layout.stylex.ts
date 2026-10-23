import * as stylex from "@stylexjs/stylex";

/** 画面部品の高さ（px）。地図の padding・Toast の位置合わせに使う。stylex.create 内から参照できるよう defineConsts */
export const layout = stylex.defineConsts({
  peek: 108, // BottomSheet ピーク時の高さ
  peekEmpty: 88, // 同 経路なし時（文言 1 行のみ）
  half: 75, // BottomSheet 展開時の高さ（dvh）
  navigationBar: 80, // NavigationBar
  hud: 88, // NavigationHud 本体（バナー除く）
  next: 36, // NavigationHud 「その先」行
});
