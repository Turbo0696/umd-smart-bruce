import type { NewsvendorParams } from "@/lib/newsvendor";

export type NewsvendorScenario = NewsvendorParams & {
  slug: string;
  name: string;
  description: string;
  unit: string;
};

export const NEWSVENDOR_SCENARIOS: NewsvendorScenario[] = [
  {
    slug: "newsstand",
    name: "Downtown Newsstand",
    description:
      "Daily papers — cheap to print, worthless once the news is stale.",
    unit: "copies",
    price: 3,
    cost: 1.2,
    salvage: 0.1,
    demandMin: 40,
    demandMax: 120,
  },
  {
    slug: "bakery",
    name: "Corner Bakery Croissants",
    description:
      "Fresh croissants baked each morning — yesterday's batch sells at a steep discount.",
    unit: "croissants",
    price: 4.5,
    cost: 1.8,
    salvage: 0.75,
    demandMin: 60,
    demandMax: 160,
  },
  {
    slug: "holiday-ornaments",
    name: "Holiday Ornament Stall",
    description:
      "Seasonal ornaments with a real markup, but almost worthless once the season ends.",
    unit: "ornaments",
    price: 12,
    cost: 5,
    salvage: 1,
    demandMin: 80,
    demandMax: 220,
  },
];

export function getScenario(slug: string): NewsvendorScenario | undefined {
  return NEWSVENDOR_SCENARIOS.find((s) => s.slug === slug);
}

export function randomScenario(): NewsvendorScenario {
  return NEWSVENDOR_SCENARIOS[
    Math.floor(Math.random() * NEWSVENDOR_SCENARIOS.length)
  ];
}
