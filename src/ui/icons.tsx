// 方向アイコン。矢印 1 本を sign ごとに回転・反転。U ターン・寄り・ラウンドアバウト・ピンは個別パス
const ARROW = "M12 20V5m0 0-5 5m5-5 5 5";
const UTURN = "M8 20V9a4 4 0 0 1 8 0v5m0 0-3-3m3 3 3-3";
const KEEP = "M9 20v-7l5-5m0 0h-4m4 0v4M15 20v-6";
const PIN = "M12 21s-6-5.5-6-10a6 6 0 0 1 12 0c0 4.5-6 10-6 10z";

const ROTATE: Record<number, number> = {
  0: 0,
  1: 45,
  2: 90,
  3: 135,
  "-1": -45,
  "-2": -90,
  "-3": -135,
};

function svgProps(size: number) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
}

// 出発地 = 白抜き丸、到着地 = ピン
export function PointIcon({ role, size = 24 }: { role: "from" | "to"; size?: number }) {
  return (
    <svg {...svgProps(size)}>
      {role === "from" ? <circle cx={12} cy={12} r={4} /> : <path d={PIN} />}
    </svg>
  );
}

export function DirectionIcon({ sign, size = 24 }: { sign: number; size?: number }) {
  const common = svgProps(size);
  if (sign === 4 || sign === 5) {
    return (
      <svg {...common}>
        <path d={PIN} />
        <circle cx={12} cy={11} r={2} />
      </svg>
    );
  }
  if (sign === 6) {
    return (
      <svg {...common}>
        <circle cx={12} cy={14} r={5} />
        <path d="M12 9V3m0 0-3 3m3-3 3 3" />
      </svg>
    );
  }
  if (sign === 8 || sign === -8 || sign === -98) {
    return (
      <svg {...common} style={sign === -8 ? { transform: "scaleX(-1)" } : undefined}>
        <path d={UTURN} />
      </svg>
    );
  }
  if (sign === 7 || sign === -7) {
    return (
      <svg {...common} style={sign === -7 ? { transform: "scaleX(-1)" } : undefined}>
        <path d={KEEP} />
      </svg>
    );
  }
  const deg = ROTATE[sign] ?? 0; // 未知の sign は直進
  return (
    <svg {...common} style={deg ? { transform: `rotate(${deg}deg)` } : undefined}>
      <path d={ARROW} />
    </svg>
  );
}
