"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const VALID_ROLES = ["STUDENT", "INSTRUCTOR", "ADMIN"] as const;
type ValidRole = (typeof VALID_ROLES)[number];

export async function updateUserRole(userId: string, role: string) {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "ADMIN") {
    throw new Error("Only admins can change user roles.");
  }

  if (!VALID_ROLES.includes(role as ValidRole)) {
    throw new Error("Invalid role.");
  }

  await prisma.profile.update({
    where: { id: userId },
    data: { role: role as ValidRole },
  });

  revalidatePath("/admin/users");
}
