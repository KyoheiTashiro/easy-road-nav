import { useRef, type RefObject, type TouchEvent } from "react";
import { tripActions } from "@/store/trip.ts";
import { layout } from "@/ui/layout.stylex.ts";

const SWIPE_PX = 30;
const DRAG_START_PX = 10; // iOS のタップ判定の揺れより大きく

/** シートを指に追従させ、離したときの向きで開閉する。戻り値はシートの div に渡す ref とタッチハンドラ */
export function useSheetDrag(
  body: RefObject<HTMLDivElement | null>,
  expanded: boolean,
  peek: number,
) {
  const sheet = useRef<HTMLDivElement>(null);
  const touchY = useRef(0);
  const touchScrollTop = useRef(0);
  const startHeight = useRef(0);

  const onTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    touchY.current = event.touches[0]?.clientY ?? 0;
    // ハンドル上の下スワイプはリストがスクロール済みでも閉じる
    touchScrollTop.current = body.current?.contains(event.target as Node)
      ? body.current.scrollTop
      : 0;
    startHeight.current = sheet.current?.getBoundingClientRect().height ?? 0;
  };

  // 指に追従。途中からのスクロールで先頭に戻っても閉じない。先頭にいる状態で始めた下スワイプだけ閉じる
  const dragAllowed = (dy: number) => !(dy > 0 && touchScrollTop.current > 0);

  const onTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    const element = sheet.current;
    const dy = (event.touches[0]?.clientY ?? touchY.current) - touchY.current;
    if (!element || !dragAllowed(dy)) return;
    // 展開済みはリストのスクロールが主。シートの高さを触ると iOS がスクロールもタップも取りこぼす（先頭でタップ時の数 px の揺れでも起きる）ので、閉じ方向へ明確に動くまで触らない（追従開始後の反転は追従を続ける）
    if (expanded && dy < DRAG_START_PX && !element.style.maxHeight) return;

    const expandedHeight = (window.innerHeight * layout.half) / 100;
    const height = Math.min(expandedHeight, Math.max(peek, startHeight.current - dy));

    element.style.transition = "none";
    element.style.maxHeight = `${height}px`;
  };

  // 以降は class の max-height へアニメーション。touchcancel（画面端のシステムジェスチャ等）でも戻さないと固着する
  const resetStyle = () => {
    const element = sheet.current;
    if (!element) return;

    element.style.transition = "";
    element.style.maxHeight = "";
  };

  const onTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    resetStyle();

    const dy = (event.changedTouches[0]?.clientY ?? touchY.current) - touchY.current;
    if (Math.abs(dy) < SWIPE_PX || !dragAllowed(dy)) return;

    tripActions.setSheet(dy < 0);
  };

  return { ref: sheet, onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: resetStyle };
}
