import type { Game, Profile } from "@prisma/client";
import { createNewsvendorSession, joinNewsvendorSessionByCode } from "./newsvendor-actions";

export function NewsvendorLanding({
  game,
  profile,
}: {
  game: Game;
  profile: Profile | null;
}) {
  const canCreate = profile?.role === "INSTRUCTOR" || profile?.role === "ADMIN";
  const createSessionForGame = createNewsvendorSession.bind(null, game.slug);

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

      {!profile && (
        <p className="mt-6 text-sm text-zinc-500 dark:text-zinc-500">
          Log in to create or join a session.
        </p>
      )}

      {canCreate && (
        <form
          action={createSessionForGame}
          className="mt-8 flex flex-col gap-3 rounded-lg border border-zinc-200 p-5 dark:border-zinc-800"
        >
          <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">
            Create a new session
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <label className={labelClass}>
              Price
              <input
                type="number"
                name="price"
                step="0.01"
                min="0"
                defaultValue={5}
                required
                className={inputClass}
              />
            </label>
            <label className={labelClass}>
              Cost
              <input
                type="number"
                name="cost"
                step="0.01"
                min="0"
                defaultValue={2}
                required
                className={inputClass}
              />
            </label>
            <label className={labelClass}>
              Salvage value
              <input
                type="number"
                name="salvage"
                step="0.01"
                min="0"
                defaultValue={0}
                required
                className={inputClass}
              />
            </label>
            <label className={labelClass}>
              Rounds
              <input
                type="number"
                name="totalRounds"
                min="1"
                step="1"
                defaultValue={8}
                required
                className={inputClass}
              />
            </label>
            <label className={labelClass}>
              Min demand
              <input
                type="number"
                name="demandMin"
                min="0"
                step="1"
                defaultValue={10}
                required
                className={inputClass}
              />
            </label>
            <label className={labelClass}>
              Max demand
              <input
                type="number"
                name="demandMax"
                min="0"
                step="1"
                defaultValue={50}
                required
                className={inputClass}
              />
            </label>
          </div>
          <button
            type="submit"
            className="mt-2 rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Create session
          </button>
        </form>
      )}

      {profile && (
        <form
          action={joinNewsvendorSessionByCode}
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
