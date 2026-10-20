import { expect, test } from "vitest";
import { rankHits } from "@/api/gsi.ts";

test("rankHits: クエリ全文を含む候補が先頭、各群内は元の順序", () => {
  const h = (label: string) => ({ label, lat: 0, lng: 0 });
  const hits = [h("北海道札幌市東区"), h("岩手県花巻市東"), h("東逗子郵便局"), h("東逗子駅")];
  expect(rankHits("東逗子", hits).map((x) => x.label)).toEqual([
    "東逗子郵便局",
    "東逗子駅",
    "北海道札幌市東区",
    "岩手県花巻市東",
  ]);
});
