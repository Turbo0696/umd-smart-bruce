export type Post = {
  slug: string;
  title: string;
  body: string;
  pinned: boolean;
  date: string;
};

export type Topic = {
  slug: string;
  name: string;
  description: string;
  posts: Post[];
};

// Seed data. Once the Supabase/Prisma database is wired up (Phase 2),
// this will be replaced by a query against the Topic/Post tables —
// the shape here matches that schema on purpose.
export const topics: Topic[] = [
  {
    slug: "decision-sciences",
    name: "Decision Sciences",
    description:
      "Course announcements, readings, and resources for Decision Sciences.",
    posts: [
      {
        slug: "welcome",
        title: "Welcome to Decision Sciences",
        body: "This board will host announcements, readings, and resources for the course. Check back for updates.",
        pinned: true,
        date: "2026-09-01",
      },
    ],
  },
  {
    slug: "supply-chain-management",
    name: "Supply Chain Management",
    description:
      "Course announcements, readings, and resources for Supply Chain Management.",
    posts: [
      {
        slug: "welcome",
        title: "Welcome to Supply Chain Management",
        body: "This board will host announcements, readings, and resources for the course, including the upcoming Beer Game simulation.",
        pinned: true,
        date: "2026-09-01",
      },
    ],
  },
];

export function getTopic(slug: string): Topic | undefined {
  return topics.find((t) => t.slug === slug);
}
