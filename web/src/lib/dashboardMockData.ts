/** Shapes align with gateway `GET /api/finance/dashboard/*` JSON `data` fields. */

export type MockRevenuePoint = { period: string; amount_cents: number };
export type MockRevenueData = {
  total_cents: number;
  currency: string;
  trend: MockRevenuePoint[];
};
export type MockRegionRow = {
  region: string;
  amount_cents: number;
  transaction_count: number;
};
export type MockRegionsData = { regions: MockRegionRow[]; currency: string };
export type MockCatRow = {
  package_slug: string;
  net_amount_cents: number;
  trip_count: number;
  distinct_riders: number;
  distinct_drivers: number;
};
export type MockCategoriesData = { categories: MockCatRow[]; currency: string };

function sumTrend(trend: MockRevenuePoint[]): number {
  return trend.reduce((s, p) => s + p.amount_cents, 0);
}

function trendForGranularity(granularity: "day" | "month" | "year"): MockRevenuePoint[] {
  const now = new Date();
  if (granularity === "day") {
    const out: MockRevenuePoint[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const period = d.toISOString().slice(0, 10);
      const wave = Math.round(12000 + 6500 * Math.sin(i / 2.2) + (i % 5) * 800);
      out.push({ period, amount_cents: wave });
    }
    return out;
  }
  if (granularity === "month") {
    const out: MockRevenuePoint[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const amount_cents = 280_000 + (i % 4) * 42_000 + (11 - i) * 12_000;
      out.push({ period, amount_cents });
    }
    return out;
  }
  const out: MockRevenuePoint[] = [];
  const y0 = now.getFullYear();
  for (let i = 4; i >= 0; i--) {
    const year = y0 - i;
    out.push({ period: String(year), amount_cents: 2_400_000 + i * 180_000 });
  }
  return out;
}

const MOCK_REGIONS: MockRegionRow[] = [
  { region: "9q8yyk8", amount_cents: 482_300, transaction_count: 412 },
  { region: "9q9p1d3", amount_cents: 318_450, transaction_count: 276 },
  { region: "9q5ctr8", amount_cents: 205_100, transaction_count: 189 },
  { region: "dr5regw", amount_cents: 156_800, transaction_count: 134 },
  { region: "dpz83df", amount_cents: 98_200, transaction_count: 87 },
];

const MOCK_CATEGORIES: MockCatRow[] = [
  {
    package_slug: "sedan-comfort",
    net_amount_cents: 512_400,
    trip_count: 428,
    distinct_riders: 301,
    distinct_drivers: 42,
  },
  {
    package_slug: "suv-xl",
    net_amount_cents: 389_150,
    trip_count: 214,
    distinct_riders: 178,
    distinct_drivers: 28,
  },
  {
    package_slug: "hatch-economy",
    net_amount_cents: 241_900,
    trip_count: 612,
    distinct_riders: 445,
    distinct_drivers: 55,
  },
  {
    package_slug: "premium-black",
    net_amount_cents: 176_300,
    trip_count: 98,
    distinct_riders: 82,
    distinct_drivers: 19,
  },
];

export function getMockFinanceDashboard(trendGranularity: "day" | "month" | "year"): {
  revenue: MockRevenueData;
  regions: MockRegionsData;
  categories: MockCategoriesData;
} {
  const trend = trendForGranularity(trendGranularity);
  const currency = "usd";
  return {
    revenue: {
      total_cents: sumTrend(trend),
      currency,
      trend,
    },
    regions: { regions: MOCK_REGIONS, currency },
    categories: { categories: MOCK_CATEGORIES, currency },
  };
}
