import * as stylex from "@stylexjs/stylex";
import arrow from "./arrow.svg";
import circle from "./circle.svg";
import home from "./home.svg";
import keep from "./keep.svg";
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

function Icon({ src, size, transform = "" }: { src: string; size: number; transform?: string }) {
  return <span {...stylex.props(styles.icon(src, size, transform || null))} aria-hidden />;
}

export function FromIcon({ size = 24 }: { size?: number }) {
  return <Icon src={circle} size={size} />;
}

export function ToIcon({ size = 24 }: { size?: number }) {
  return <Icon src={pin} size={size} />;
}

export function HomeIcon({ size = 24 }: { size?: number }) {
  return <Icon src={home} size={size} />;
}

export function NarrowIcon({ size = 24 }: { size?: number }) {
  return <Icon src={narrow} size={size} />;
}

export function TurnsIcon({ size = 24 }: { size?: number }) {
  return <Icon src={turns} size={size} />;
}

export function VolumeIcon({ size = 24 }: { size?: number }) {
  return <Icon src={volume} size={size} />;
}

export function VolumeOffIcon({ size = 24 }: { size?: number }) {
  return <Icon src={volumeOff} size={size} />;
}

type DirIcon = { src: string; deg?: number };
const STRAIGHT: DirIcon = { src: arrow };

// |sign|（GraphHopper `instructions[].sign`、曲がる方向コード）→ アイコン
// 0 直進、1 やや、2 通常、3 鋭角（矢印の回転角）、4 / 5 到着（経由地含む）、6 ラウンドアバウト、7 寄り、8 / 98 U ターン
// 正が右、負が左。左向きは右向きを scaleX(-1) で反転
const ICON: Record<number, DirIcon> = {
  0: STRAIGHT,
  1: { src: arrow, deg: 45 },
  2: { src: arrow, deg: 90 },
  3: { src: arrow, deg: 135 },
  4: { src: pinDot },
  5: { src: pinDot },
  6: { src: roundabout },
  7: { src: keep },
  8: { src: uturn },
  98: { src: uturn },
};

export function DirectionIcon({ sign, size = 24 }: { sign: number; size?: number }) {
  const { src, deg = 0 } = ICON[Math.abs(sign)] ?? STRAIGHT;
  const parts = [];
  if (sign < 0) parts.push("scaleX(-1)");
  if (deg) parts.push(`rotate(${deg}deg)`);
  return <Icon src={src} size={size} transform={parts.join(" ")} />;
}
