import { prisma } from "@/lib/prisma";

export function listCoursesForInstructor(instructorId: string) {
  return prisma.course.findMany({
    where: { instructorId },
    include: { topic: true, enrollments: true },
    orderBy: { createdAt: "desc" },
  });
}

export function listCoursesForStudent(userId: string) {
  return prisma.course.findMany({
    where: { enrollments: { some: { userId } } },
    include: { topic: true, instructor: true },
    orderBy: { createdAt: "desc" },
  });
}

export function getCourseById(id: string) {
  return prisma.course.findUnique({
    where: { id },
    include: {
      topic: true,
      instructor: true,
      enrollments: { include: { user: true }, orderBy: { createdAt: "asc" } },
      gameSessions: { include: { game: true }, orderBy: { createdAt: "desc" } },
      newsvendorSessions: { include: { game: true }, orderBy: { createdAt: "desc" } },
    },
  });
}
