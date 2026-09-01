export type ForecastDataset = {
  slug: string;
  name: string;
  description: string;
  unit: string;
  values: number[]; // 12 periods, most recent last
};

// Fixed, hand-built synthetic series (not real/scraped data) chosen so
// each forecasting method has a dataset where it's actually instructive.
export const FORECAST_DATASETS: ForecastDataset[] = [
  {
    slug: "trending-product",
    name: "Trending Product Sales",
    description:
      "A product ramping up in popularity — steady upward trend with mild noise.",
    unit: "units",
    values: [102, 108, 115, 119, 128, 133, 141, 147, 156, 162, 171, 179],
  },
  {
    slug: "stable-revenue",
    name: "Stable Weekly Revenue",
    description:
      "A mature product line with roughly flat demand and small random swings.",
    unit: "$K",
    values: [48, 51, 47, 50, 49, 52, 46, 50, 51, 48, 49, 50],
  },
  {
    slug: "choppy-demand",
    name: "Choppy Retail Demand",
    description:
      "Noisier week-to-week demand with no strong trend — a harder case for simple averages.",
    unit: "units",
    values: [220, 265, 190, 240, 275, 205, 250, 230, 260, 210, 245, 235],
  },
];

export function getDataset(slug: string): ForecastDataset | undefined {
  return FORECAST_DATASETS.find((d) => d.slug === slug);
}

export function randomDataset(): ForecastDataset {
  return FORECAST_DATASETS[Math.floor(Math.random() * FORECAST_DATASETS.length)];
}
