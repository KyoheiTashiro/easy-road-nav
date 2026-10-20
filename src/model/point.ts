export type LatLng = { lat: number; lng: number };
export type Fix = LatLng & { accuracy: number; t: number }; // t = position.timestamp
export type Point = LatLng & { label: string | null }; // label null = 逆ジオ中
export type PointRole = "from" | "to" | { via: number }; // 地点の役割（マーカー削除・リスト操作）
export type SavedPoint = LatLng & { label: string }; // 自宅・検索履歴・検索候補。label 確定済みのみ

/** 経由地の上限（CONTEXT.md） */
export const MAX_VIAS = 5;
