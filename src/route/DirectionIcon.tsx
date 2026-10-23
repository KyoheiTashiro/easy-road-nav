import arrow from "@/shared/icons/arrow.svg";
import { Icon } from "@/shared/icons/index.tsx";
import keep from "@/shared/icons/keep.svg";
import pinDot from "@/shared/icons/pin-dot.svg";
import roundabout from "@/shared/icons/roundabout.svg";
import uturn from "@/shared/icons/uturn.svg";
import { SIGN } from "@/route/route.ts";

type DirectionIconSource = { url: string; degrees?: number };
const STRAIGHT: DirectionIconSource = { url: arrow };

// |sign| → アイコン。右向きで持ち、左向きは scaleX(-1) で反転
const ICON: Record<number, DirectionIconSource> = {
  [SIGN.CONTINUE]: STRAIGHT,
  [SIGN.SLIGHT_RIGHT]: { url: arrow, degrees: 45 },
  [SIGN.RIGHT]: { url: arrow, degrees: 90 },
  [SIGN.SHARP_RIGHT]: { url: arrow, degrees: 135 },
  [SIGN.FINISH]: { url: pinDot },
  [SIGN.VIA_REACHED]: { url: pinDot },
  [SIGN.ROUNDABOUT]: { url: roundabout },
  [SIGN.KEEP_RIGHT]: { url: keep },
  [SIGN.U_TURN_RIGHT]: { url: uturn },
  [-SIGN.U_TURN_UNKNOWN]: { url: uturn },
};

export function DirectionIcon({ sign, size = 24 }: { sign: number; size?: number }) {
  const { url, degrees = 0 } = ICON[Math.abs(sign)] ?? STRAIGHT;

  const parts = [];
  if (sign < 0) parts.push("scaleX(-1)");
  if (degrees) parts.push(`rotate(${degrees}deg)`);
  return <Icon url={url} size={size} transform={parts.join(" ")} />;
}
