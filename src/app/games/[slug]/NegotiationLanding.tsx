import type { Game, Profile } from "@prisma/client";
import { DEFAULT_NEGOTIATION_CONFIG } from "@/lib/negotiation";
import { createNegotiationSession, joinNegotiationByCode } from "./negotiation-actions";

export function NegotiationLanding({
  game,
  profile,
  instructorCourses,
}: {
  game: Game;
  profile: Profile | null;
  instructorCourses?: { id: string; name: string; term: string }[];
}) {
  const canCreate = profile?.role === "INSTRUCTOR" || profile?.role === "ADMIN";
  const createSessionForGame = createNegotiationSession.bind(null, game.slug);
  const cfg = DEFAULT_NEGOTIATION_CONFIG;

  const inputClass =
    "rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";
  const labelClass = "flex flex-col gap-1 text-sm";

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        {game.name}
      </h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">{game.description}</p>
      <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-500">
        Each pair is a retailer and a wholesaler, fixed for the whole game.
        The retailer knows its own end-consumer demand for every month ahead
        but not the wholesaler&apos;s cost; the wholesaler knows its cost but
        not the retailer&apos;s demand unless the retailer chooses to share
        it. They negotiate one contract — a unit price and a delivery
        schedule — over a few rounds. The retailer wants small, frequent
        deliveries to keep its own inventory low; the wholesaler wants to
        consolidate into one big shipment to save on its own ordering costs.
        Whoever they settle on, the price itself is just a transfer between
        them — the debrief compares their combined profit to what a single,
        vertically-integrated firm could have made.
      </p>

      {!profile && (
        <p className="mt-6 text-sm text-zinc-500 dark:text-zinc-500">
          Log in to create or join a session.
        </p>
      )}

      {canCreate && (
        <form
          action={createSessionForGame}
          className="mt-8 flex flex-col gap-4 rounded-lg border border-zinc-200 p-5 dark:border-zinc-800"
        >
          <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">
            Create a new session
          </h2>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className={labelClass}>
              Month labels (comma-separated)
              <input
                name="horizonLabels"
                defaultValue={cfg.horizonLabels.join(", ")}
                className={inputClass}
              />
            </label>
            <label className={labelClass}>
              Monthly demand, in units (comma-separated)
              <input
                name="monthlyDemand"
                defaultValue={cfg.monthlyDemand.join(", ")}
                className={inputClass}
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <NumberField name="retailPrice" label="Retail price ($/unit)" defaultValue={cfg.retailPrice} />
            <NumberField name="salvagePrice" label="Retailer salvage ($/unit)" defaultValue={cfg.salvagePrice} />
            <NumberField
              name="retailerOrderCost"
              label="Retailer order cost ($)"
              defaultValue={cfg.retailerOrderCost}
            />
            <NumberField
              name="retailerHoldingCost"
              label="Retailer holding ($/unit/month)"
              defaultValue={cfg.retailerHoldingCost}
            />
            <NumberField
              name="manufacturerCost"
              label="Manufacturer price ($/unit)"
              defaultValue={cfg.manufacturerCost}
            />
            <NumberField
              name="wholesalerOrderCost"
              label="Wholesaler order cost ($)"
              defaultValue={cfg.wholesalerOrderCost}
            />
            <NumberField
              name="wholesalerHoldingCost"
              label="Wholesaler holding ($/unit/month)"
              defaultValue={cfg.wholesalerHoldingCost}
            />
            <NumberField
              name="wholesalerSalvage"
              label="Wholesaler salvage ($/unit)"
              defaultValue={cfg.wholesalerSalvage}
            />
            <NumberField name="totalRounds" label="Negotiation rounds" defaultValue={cfg.totalRounds} />
          </div>

          <label className={labelClass}>
            Per-round time limit, in minutes (optional)
            <input
              type="number"
              name="roundMinutes"
              min="1"
              step="1"
              placeholder="No limit"
              className={inputClass}
            />
          </label>
          <p className="text-xs text-zinc-500 dark:text-zinc-500">
            This is a guideline for you to enforce in the room — nothing
            forces a round to end automatically when it expires. Use
            &quot;Resolve everything stalled right now&quot; on the session
            page for a round that runs past its clock.
          </p>

          <div className="flex flex-col gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="allowDemandSharing" defaultChecked />
              Let retailers choose to share their demand schedule with their
              wholesaler
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="allowNotes" defaultChecked />
              Allow a short written note with each offer
            </label>
          </div>

          {instructorCourses && instructorCourses.length > 0 && (
            <label className={labelClass}>
              Assign to a course (optional)
              <select name="courseId" defaultValue="" className={inputClass}>
                <option value="">No course (standalone)</option>
                {instructorCourses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {c.term}
                  </option>
                ))}
              </select>
            </label>
          )}

          <button
            type="submit"
            className="mt-2 self-start rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Create session
          </button>
        </form>
      )}

      {profile && (
        <form
          action={joinNegotiationByCode}
          className="mt-4 flex flex-col gap-3 rounded-lg border border-zinc-200 p-5 dark:border-zinc-800"
        >
          <label className="flex flex-col gap-1 text-sm">
            Have a join code?
            <input
              name="code"
              placeholder="e.g. AB3XQ9"
              required
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm uppercase dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:placeholder-zinc-500"
            />
          </label>
          <button
            type="submit"
            className="self-start rounded-full border border-zinc-300 px-5 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-800"
          >
            Join session
          </button>
        </form>
      )}
    </div>
  );
}

function NumberField({
  name,
  label,
  defaultValue,
}: {
  name: string;
  label: string;
  defaultValue: number;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
      {label}
      <input
        type="number"
        name={name}
        min={0}
        step="any"
        defaultValue={defaultValue}
        className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
      />
    </label>
  );
}
