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

await prisma.$disconnect();
