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
  size = 24,
  transform = "",
}: {
  url: string;
  size?: number;
  transform?: string;
}) {
  return <span {...stylex.props(styles.icon(url, size, transform || null))} aria-hidden />;
}

type IconProps = { size?: number };

export const FromIcon = (props: IconProps) => <Icon url={circle} {...props} />;
export const ToIcon = (props: IconProps) => <Icon url={pin} {...props} />;
export const HomeIcon = (props: IconProps) => <Icon url={home} {...props} />;
export const SettingsIcon = (props: IconProps) => <Icon url={gear} {...props} />;
export const LocateIcon = (props: IconProps) => <Icon url={locate} {...props} />;
export const NarrowIcon = (props: IconProps) => <Icon url={narrow} {...props} />;
export const TurnsIcon = (props: IconProps) => <Icon url={turns} {...props} />;
export const VolumeIcon = (props: IconProps) => <Icon url={volume} {...props} />;
export const VolumeOffIcon = (props: IconProps) => <Icon url={volumeOff} {...props} />;
