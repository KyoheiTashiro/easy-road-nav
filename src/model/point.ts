export type LatLng = { lat: number; lng: number };
export type Fix = LatLng & { accuracy: number; t: number }; // t = position.timestamp
export type Point = LatLng & { label: string | null }; // label null = 逆ジオ中
export const ROLE = { FROM: "from", TO: "to", VIA: "via", HOME: "home" } as const;
export type Slot = typeof ROLE.FROM | typeof ROLE.TO; // 出発地 / 到着地
export type PointRole = Slot | typeof ROLE.VIA; // 地図ポップアップの地点指定
export type PickRole = Slot | typeof ROLE.HOME; // 検索欄の種類
export type SavedPoint = LatLng & { label: string }; // 自宅・検索履歴・検索候補。label 確定済みのみ

/** 経由地の上限（CONTEXT.md） */
export const MAX_VIAS = 5;
