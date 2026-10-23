// 調整値。docs/CONTEXT.md「調整値」の表と同じ順・同じ名前。細い道・有料ペナルティと速度係数は graphhopper/config.yml

export const NARROW_IGNORE_BELOW = 30; // 短区間無視 m
export const NARROW_MERGE_BELOW = 50; // 区間結合 m
export const OFF_ROUTE = 50; // 経路外れ距離 m
export const REROUTE_COUNT = 3; // リルート連続回数
export const REROUTE_OFFSET = 30; // リルート前方オフセット m
export const ACCURACY_MAX = 50; // 進捗採用精度 m
export const ARRIVE = 30; // 到着判定 m
export const ANNOUNCE_FAR = 300; // 案内トリガー距離（予告）m
export const ANNOUNCE_NEAR = 50; // 案内トリガー距離（直前）m
export const NARROW_WARN = 300; // 細い道警告距離 m
export const MIN_MOVE = 5; // 方位算出最小移動 m
export const NEXT_NEXT_MAX = 1000; // 次の次表示上限 m
export const HISTORY_MAX = 5; // 検索履歴件数
export const FORK_ANGLE = 45; // 分岐判定角 deg
