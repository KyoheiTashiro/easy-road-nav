import * as stylex from "@stylexjs/stylex";
import { SIGN } from "@/model/route.ts";
import arrow from "./arrow.svg";
import circle from "./circle.svg";
import gear from "./gear.svg";
import home from "./home.svg";
import keep from "./keep.svg";
import locate from "./locate.svg";
import narrow from "./narrow.svg";
import pin from "./pin.svg";
import pinDot from "./pin-dot.svg";
import roundabout from "./roundabout.svg";
import turns from "./turns.svg";
import uturn from "./uturn.svg";
import volume from "./volume.svg";
import volumeOff from "./volume-off.svg";

// SVG は形だけ持ち、色は mask + currentColor で親の color に従う
const styles = stylex.create({
  icon: (url: string, size: number, transform: string | null) => ({
    display: "inline-block",
    flexShrink: 0,
    width: size,
    height: size,
    backgroundColor: "currentColor",
    maskImage: `url("${url}")`, // Vite の data URI は ' を含むので引用必須
    maskSize: "100% 100%",
    maskRepeat: "no-repeat",
    transform,
  }),
});

function Icon({ url, size, transform = "" }: { url: string; size: number; transform?: string }) {
  return <span {...stylex.props(styles.icon(url, size, transform || null))} aria-hidden />;
}

export function FromIcon({ size = 24 }: { size?: number }) {
  return <Icon url={circle} size={size} />;
}

export function ToIcon({ size = 24 }: { size?: number }) {
  return <Icon url={pin} size={size} />;
}

export function HomeIcon({ size = 24 }: { size?: number }) {
  return <Icon url={home} size={size} />;
}

export function SettingsIcon({ size = 24 }: { size?: number }) {
  return <Icon url={gear} size={size} />;
}

export function LocateIcon({ size = 24 }: { size?: number }) {
  return <Icon url={locate} size={size} />;
}

export function NarrowIcon({ size = 24 }: { size?: number }) {
  return <Icon url={narrow} size={size} />;
}

export function TurnsIcon({ size = 24 }: { size?: number }) {
  return <Icon url={turns} size={size} />;
}

export function VolumeIcon({ size = 24 }: { size?: number }) {
  return <Icon url={volume} size={size} />;
}

export function VolumeOffIcon({ size = 24 }: { size?: number }) {
  return <Icon url={volumeOff} size={size} />;
}

type DirectionIconSource = { url: string; deg?: number };
const STRAIGHT: DirectionIconSource = { url: arrow };

// |sign| → アイコン。右向きで持ち、左向きは scaleX(-1) で反転
const ICON: Record<number, DirectionIconSource> = {
  [SIGN.CONTINUE]: STRAIGHT,
  [SIGN.SLIGHT_RIGHT]: { url: arrow, deg: 45 },
  [SIGN.RIGHT]: { url: arrow, deg: 90 },
  [SIGN.SHARP_RIGHT]: { url: arrow, deg: 135 },
  [SIGN.FINISH]: { url: pinDot },
  [SIGN.VIA_REACHED]: { url: pinDot },
  [SIGN.ROUNDABOUT]: { url: roundabout },
  [SIGN.KEEP_RIGHT]: { url: keep },
  [SIGN.U_TURN_RIGHT]: { url: uturn },
  [-SIGN.U_TURN_UNKNOWN]: { url: uturn },
};

export function DirectionIcon({ sign, size = 24 }: { sign: number; size?: number }) {
  const { url, deg = 0 } = ICON[Math.abs(sign)] ?? STRAIGHT;

  const parts = [];
  if (sign < 0) parts.push("scaleX(-1)");
  if (deg) parts.push(`rotate(${deg}deg)`);
  return <Icon url={url} size={size} transform={parts.join(" ")} />;
}
