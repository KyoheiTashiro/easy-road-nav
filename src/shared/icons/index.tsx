import * as stylex from "@stylexjs/stylex";
import circle from "./circle.svg";
import gear from "./gear.svg";
import home from "./home.svg";
import locate from "./locate.svg";
import narrow from "./narrow.svg";
import pin from "./pin.svg";
import turns from "./turns.svg";
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

export function Icon({
  url,
  size,
  transform = "",
}: {
  url: string;
  size: number;
  transform?: string;
}) {
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
