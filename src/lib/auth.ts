import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

// Called from the root layout on every request, so a Profile row
// always exists for a signed-in Supabase user without needing a
// separate email-confirmation callback route.
export async function getCurrentProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  return prisma.profile.upsert({
    where: { id: user.id },
    update: {},
    create: {
      id: user.id,
      email: user.email!,
    },
  });
}
