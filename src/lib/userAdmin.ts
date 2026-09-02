import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";

// Finds an existing Profile by email, or creates a brand-new Supabase
// auth account (via an invite email — they set their own password
// through Supabase's own flow) plus its Profile row. Shared by admin's
// "add a user" and an instructor's "add a student to my course," since
// both ultimately need "make sure this email has an account."
export async function findOrInviteUser(
  email: string,
  defaultRole: Role,
  name?: string,
) {
  const existing = await prisma.profile.findUnique({ where: { email } });
  if (existing) return existing;

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email);
  if (error || !data.user) {
    throw new Error(`Could not create an account for ${email}: ${error?.message ?? "unknown error"}`);
  }

  return prisma.profile.create({
    data: { id: data.user.id, email, name, role: defaultRole },
  });
}
