import { prisma } from "@/lib/prisma";

export function listTopics() {
  return prisma.topic.findMany({ orderBy: { name: "asc" } });
}

export function getTopicWithPosts(slug: string) {
  return prisma.topic.findUnique({
    where: { slug },
    include: {
      posts: {
        orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
        include: { author: true },
      },
      tutorTopics: { orderBy: { createdAt: "desc" } },
    },
  });
}
