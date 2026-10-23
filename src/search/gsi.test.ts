import { expect, test } from "vitest";
import { rankHits } from "@/search/gsi.ts";

test("rankHits: クエリ全文を含む候補が先頭、各群内は元の順序", () => {
  const hit = (label: string) => ({ label, lat: 0, lng: 0 });
  const hits = [
    hit("北海道札幌市東区"),
    hit("岩手県花巻市東"),
    hit("東逗子郵便局"),
    hit("東逗子駅"),
  ];

  expect(rankHits("東逗子", hits).map((ranked) => ranked.label)).toEqual([
    "東逗子郵便局",
    "東逗子駅",
    "北海道札幌市東区",
    "岩手県花巻市東",
  ]);
});
