import type { Game, Profile } from "@prisma/client";
import { DEFAULT_CONFIG } from "@/lib/fishBanks";
import { createFishBanksSession, joinFishBanksSessionByCode } from "./fish-banks-actions";

export function FishBanksLanding({
  game,
  profile,
  instructorCourses,
}: {
  game: Game;
  profile: Profile | null;
  instructorCourses?: { id: string; name: string; term: string }[];
}) {
  const canCreate = profile?.role === "INSTRUCTOR" || profile?.role === "ADMIN";
  const createSessionForGame = createFishBanksSession.bind(null, game.slug);

  const inputClass =
    "rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";
  const labelClass = "flex flex-col gap-1 text-sm";

  return (
    <div className="mx-auto w-full max-w-md px-6 py-12">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        {game.name}
      </h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        {game.description}
      </p>
      <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-500">
        Every team&apos;s ships draw from the same two fish stocks — coastal
        and deep sea. Fish them out and the price you can get keeps rising,
        but so does the risk the stock never recovers.
      </p>

      {!profile && (
        <p className="mt-6 text-sm text-zinc-500 dark:text-zinc-500">
          Log in to create or join a fleet.
        </p>
      )}

      {canCreate && (
        <form
          action={createSessionForGame}
          className="mt-8 flex flex-col gap-3 rounded-lg border border-zinc-200 p-5 dark:border-zinc-800"
        >
          <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">
            Create a new fleet
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <label className={labelClass}>
              Rounds
              <input
                type="number"
                name="totalRounds"
                min="1"
                step="1"
                defaultValue={DEFAULT_CONFIG.totalRounds}
                required
                className={inputClass}
              />
            </label>
            <label className={labelClass}>
              Starting cash ($)
              <input
                type="number"
                name="startingCash"
                min="0"
                step="100"
                defaultValue={DEFAULT_CONFIG.startingCash}
                required
                className={inputClass}
              />
            </label>
            <label className={labelClass}>
              Starting ships
              <input
                type="number"
                name="startingShips"
                min="1"
                step="1"
                defaultValue={DEFAULT_CONFIG.startingShips}
                required
                className={inputClass}
              />
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
            className="mt-2 rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Create fleet
          </button>
        </form>
      )}

      {profile && (
        <form
          action={joinFishBanksSessionByCode}
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
            Join fleet
          </button>
        </form>
      )}
    </div>
  );
}
