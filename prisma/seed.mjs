import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const topics = [
  {
    slug: "decision-sciences",
    name: "Decision Sciences",
    description:
      "Course announcements, readings, and resources for Decision Sciences.",
  },
  {
    slug: "supply-chain-management",
    name: "Supply Chain Management",
    description:
      "Course announcements, readings, and resources for Supply Chain Management.",
  },
];

for (const topic of topics) {
  await prisma.topic.upsert({
    where: { slug: topic.slug },
    update: { name: topic.name, description: topic.description },
    create: topic,
  });
  console.log(`Seeded topic: ${topic.slug}`);
}

const scm = await prisma.topic.findUniqueOrThrow({
  where: { slug: "supply-chain-management" },
});

await prisma.game.upsert({
  where: { slug: "beer-game" },
  update: {
    name: "Beer Game",
    description:
      "The classic MIT supply-chain simulation: 4 roles, weekly orders under shipment delay, and the bullwhip effect.",
    topicId: scm.id,
    category: "MULTI_PLAYER",
  },
  create: {
    slug: "beer-game",
    name: "Beer Game",
    description:
      "The classic MIT supply-chain simulation: 4 roles, weekly orders under shipment delay, and the bullwhip effect.",
    topicId: scm.id,
    category: "MULTI_PLAYER",
  },
});
console.log("Seeded game: beer-game");

const decisionSciences = await prisma.topic.findUniqueOrThrow({
  where: { slug: "decision-sciences" },
});

await prisma.game.upsert({
  where: { slug: "newsvendor" },
  update: {
    name: "Newsvendor Game",
    description:
      "The classic single-period inventory decision under demand uncertainty: order too little and miss sales, order too much and eat the leftovers.",
    topicId: decisionSciences.id,
    category: "MULTI_PLAYER",
  },
  create: {
    slug: "newsvendor",
    name: "Newsvendor Game",
    description:
      "The classic single-period inventory decision under demand uncertainty: order too little and miss sales, order too much and eat the leftovers.",
    topicId: decisionSciences.id,
    category: "MULTI_PLAYER",
  },
});
console.log("Seeded game: newsvendor");

await prisma.game.upsert({
  where: { slug: "forecasting" },
  update: {
    name: "Forecasting Practice",
    description:
      "Single-player practice: compute a forecast by hand using standard methods (moving averages, exponential smoothing, trend regression), then check your work.",
    topicId: decisionSciences.id,
    category: "SINGLE_PLAYER",
  },
  create: {
    slug: "forecasting",
    name: "Forecasting Practice",
    description:
      "Single-player practice: compute a forecast by hand using standard methods (moving averages, exponential smoothing, trend regression), then check your work.",
    topicId: decisionSciences.id,
    category: "SINGLE_PLAYER",
  },
});
console.log("Seeded game: forecasting");

await prisma.game.upsert({
  where: { slug: "newsvendor-solo" },
  update: {
    name: "Newsvendor Practice",
    description:
      "Single-player: decide how much to order before demand is known, across a few different scenarios, and track your average profit over time.",
    topicId: decisionSciences.id,
    category: "SINGLE_PLAYER",
  },
  create: {
    slug: "newsvendor-solo",
    name: "Newsvendor Practice",
    description:
      "Single-player: decide how much to order before demand is known, across a few different scenarios, and track your average profit over time.",
    topicId: decisionSciences.id,
    category: "SINGLE_PLAYER",
  },
});
console.log("Seeded game: newsvendor-solo");

await prisma.game.upsert({
  where: { slug: "dice-simulator" },
  update: {
    name: "Dice Simulator",
    description:
      "Roll one, two, or three dice — once or thousands of times — and watch the distribution of sums converge, a hands-on look at the law of large numbers.",
    topicId: decisionSciences.id,
    category: "SIMULATION",
  },
  create: {
    slug: "dice-simulator",
    name: "Dice Simulator",
    description:
      "Roll one, two, or three dice — once or thousands of times — and watch the distribution of sums converge, a hands-on look at the law of large numbers.",
    topicId: decisionSciences.id,
    category: "SIMULATION",
  },
});
console.log("Seeded game: dice-simulator");

await prisma.$disconnect();
