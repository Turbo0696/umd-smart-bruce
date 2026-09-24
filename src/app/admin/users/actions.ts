"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { findOrInviteUser } from "@/lib/userAdmin";
import { createClient } from "@/lib/supabase/server";

const VALID_ROLES = ["STUDENT", "INSTRUCTOR", "ADMIN"] as const;
type ValidRole = (typeof VALID_ROLES)[number];

// Deliberately excludes ADMIN — granting admin access is a separate,
// more deliberate action via the role selector on an existing row,
// not something to casually pick in a quick "add a user" form.
const CREATABLE_ROLES = ["STUDENT", "INSTRUCTOR"] as const;

export async function createUser(formData: FormData) {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "ADMIN") {
    throw new Error("Only admins can add users.");
  }

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim() || undefined;
  const role = String(formData.get("role") ?? "");

  if (!email) throw new Error("Email is required.");
  if (!CREATABLE_ROLES.includes(role as (typeof CREATABLE_ROLES)[number])) {
    throw new Error("Invalid role.");
  }

  const existing = await prisma.profile.findUnique({ where: { email } });
  if (existing) {
    // Already have an account — just update their role/name rather
    // than erroring, so re-submitting is harmless.
    await prisma.profile.update({
      where: { id: existing.id },
      data: { role: role as ValidRole, name: name ?? existing.name },
    });
  } else {
    await findOrInviteUser(email, role as ValidRole, name);
  }

  revalidatePath("/admin/users");
}

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

// Doesn't touch a password directly — that's Supabase Auth's job. This
// just triggers Supabase's own "forgot password" email; the user sets
// their new password themselves after clicking through (see
// /reset-password). Nobody, including an admin, ever sees or sets the
// password on their behalf.
export async function resetUserPassword(email: string) {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "ADMIN") {
    throw new Error("Only admins can reset a user's password.");
  }

  const requestHeaders = await headers();
  const host = requestHeaders.get("host");
  const proto = requestHeaders.get("x-forwarded-proto") ?? "https";
  const origin = `${proto}://${host}`;

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/confirm?next=/reset-password`,
  });

  if (error) {
    throw new Error(`Could not send reset email: ${error.message}`);
  }
}
