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

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clampInt(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function trendForGranularity(granularity: "day" | "month" | "year"): MockRevenuePoint[] {
  const now = new Date();
  if (granularity === "day") {
    const out: MockRevenuePoint[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const period = d.toISOString().slice(0, 10);
      const seed = Math.floor(d.getTime() / 86400000);
      const rand = mulberry32(seed);
      const weekday = d.getDay(); // 0..6
      const weekdayBoost = weekday === 0 || weekday === 6 ? 0.82 : 1.05;
      const base = 14_500 * weekdayBoost;
      const weeklyWave = 4_900 * Math.sin((seed % 7) * 0.95 + rand() * 0.4);
      const noise = (rand() - 0.5) * 7_800;
      const promoSpike = rand() < 0.14 ? 8_000 + rand() * 16_000 : 0;
      const amount = clampInt(base + weeklyWave + noise + promoSpike, 4_500, 48_000);
      out.push({ period, amount_cents: amount });
    }
    return out;
  }
  if (granularity === "month") {
    const out: MockRevenuePoint[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const seed = d.getFullYear() * 100 + (d.getMonth() + 1);
      const rand = mulberry32(seed);
      const baseline = 320_000 + (11 - i) * 9_500;
      const seasonal = 58_000 * Math.sin((d.getMonth() / 12) * Math.PI * 2 + 0.7);
      const noise = (rand() - 0.5) * 90_000;
      const amount_cents = clampInt(baseline + seasonal + noise, 160_000, 620_000);
      out.push({ period, amount_cents });
    }
    return out;
  }
  const out: MockRevenuePoint[] = [];
  const y0 = now.getFullYear();
  for (let i = 4; i >= 0; i--) {
    const year = y0 - i;
    const rand = mulberry32(year);
    const baseline = 2_350_000 + (4 - i) * 120_000;
    const macro = (rand() - 0.5) * 320_000;
    const amount_cents = clampInt(baseline + macro, 1_600_000, 3_400_000);
    out.push({ period: String(year), amount_cents });
  }
  return out;
}

const MOCK_REGIONS: MockRegionRow[] = [
  { region: "New Delhi", amount_cents: 482_300, transaction_count: 412 },
  { region: "Mumbai", amount_cents: 318_450, transaction_count: 276 },
  { region: "Bengaluru", amount_cents: 205_100, transaction_count: 189 },
  { region: "Kolkata", amount_cents: 156_800, transaction_count: 134 },
  { region: "Chennai", amount_cents: 98_200, transaction_count: 87 },
];

const MOCK_CATEGORIES: MockCatRow[] = [
  {
    package_slug: "sedan",
    net_amount_cents: 512_400,
    trip_count: 428,
    distinct_riders: 301,
    distinct_drivers: 42,
  },
  {
    package_slug: "suv",
    net_amount_cents: 389_150,
    trip_count: 214,
    distinct_riders: 178,
    distinct_drivers: 28,
  },
  {
    package_slug: "van",
    net_amount_cents: 241_900,
    trip_count: 612,
    distinct_riders: 445,
    distinct_drivers: 55,
  },
  {
    package_slug: "luxury",
    net_amount_cents: 176_300,
    trip_count: 98,
    distinct_riders: 82,
    distinct_drivers: 19,
  },
  {
    package_slug: "carpool",
    net_amount_cents: 119_800,
    trip_count: 266,
    distinct_riders: 224,
    distinct_drivers: 31,
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
