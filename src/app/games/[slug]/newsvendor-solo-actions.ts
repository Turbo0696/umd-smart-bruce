"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/auth";
import { drawDemand, resolveOrder } from "@/lib/newsvendor";
import { getScenario } from "@/lib/newsvendorScenarios";
import { prisma } from "@/lib/prisma";

// Unlike Forecasting Practice, the "answer" here (demand) is randomly
// drawn per round, not a public formula — so it's drawn server-side,
// after the order is already locked in, rather than client-side where a
// curious student could inspect it before submitting.
export async function playRound(scenarioSlug: string, orderQty: number) {
  const profile = await getCurrentProfile();

  if (!Number.isInteger(orderQty) || orderQty < 0) {
    throw new Error("Order must be a non-negative whole number.");
  }

  const scenario = getScenario(scenarioSlug);
  if (!scenario) throw new Error("Unknown scenario.");

  const demand = drawDemand(scenario);
  const result = resolveOrder(orderQty, demand, scenario);

  // Guests can still play (demand is always drawn server-side above,
  // regardless of login) — only logged-in rounds get persisted, matching
  // the "log in to save your progress" hint shown in the UI.
  if (profile) {
    await prisma.soloNewsvendorAttempt.create({
      data: {
        userId: profile.id,
        scenarioSlug,
        orderQty,
        demand: result.demand,
        sold: result.sold,
        leftover: result.leftover,
        shortage: result.shortage,
        profit: result.profit,
      },
    });

    revalidatePath("/games/newsvendor-solo");
  }

  return result;
}
