"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/auth";
import type { ForecastMethod } from "@/lib/forecasting";
import { prisma } from "@/lib/prisma";

// Correctness/scoring is computed client-side (src/lib/forecasting.ts is
// a pure formula, not a secret — the whole point is the student learns
// it), so this action just persists what the client already computed.
// That's a deliberate, scoped trust boundary: this is a self-practice
// tool, not a graded or competitive submission, so there's no incentive
// to falsify and no other player's outcome depends on it.
export async function logForecastAttempt(
  method: ForecastMethod,
  datasetSlug: string,
  userForecast: number,
  correctForecast: number,
  percentError: number,
  score: number,
) {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("You must be logged in to save your progress.");

  await prisma.forecastingAttempt.create({
    data: {
      userId: profile.id,
      method,
      datasetSlug,
      userForecast,
      correctForecast,
      percentError,
      score,
    },
  });

  revalidatePath("/games/forecasting");
}
