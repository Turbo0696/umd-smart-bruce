import type { Game, Profile } from "@prisma/client";
import { createSession, joinSessionByCode } from "./actions";

export function BeerGameLanding({
  game,
  profile,
}: {
  game: Game;
  profile: Profile | null;
}) {
  const canCreate = profile?.role === "INSTRUCTOR" || profile?.role === "ADMIN";
  const createSessionForGame = createSession.bind(null, game.slug);

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
        <form action={createSessionForGame} className="mt-8">
          <button
            type="submit"
            className="w-full rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Create a new session
          </button>
        </form>
      )}

      {profile && (
        <form
          action={joinSessionByCode}
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
