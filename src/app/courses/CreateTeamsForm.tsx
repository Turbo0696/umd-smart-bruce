"use client";

import { useState } from "react";
import { createTeams } from "./actions";

export function CreateTeamsForm({ courseId }: { courseId: string }) {
  const [gameSlug, setGameSlug] = useState("beer-game");
  const createTeamsForCourse = createTeams.bind(null, courseId);

  const inputClass =
    "rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";
  const labelClass = "flex flex-col gap-1 text-sm";

  return (
    <form
      action={createTeamsForCourse}
      className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-5 dark:border-zinc-800"
    >
      <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">
        Create teams
      </h2>
      <div className="grid grid-cols-2 gap-3">
        <label className={labelClass}>
          Game
          <select
            name="gameSlug"
            value={gameSlug}
            onChange={(e) => setGameSlug(e.target.value)}
            className={inputClass}
          >
            <option value="beer-game">Beer Game</option>
            <option value="newsvendor">Newsvendor Game</option>
          </select>
        </label>
        <label className={labelClass}>
          Number of teams
          <input
            type="number"
            name="count"
            min={1}
            max={50}
            step={1}
            defaultValue={4}
            required
            className={inputClass}
          />
        </label>
      </div>

      {gameSlug === "newsvendor" && (
        <div className="grid grid-cols-3 gap-3">
          <label className={labelClass}>
            Price
            <input type="number" name="price" step="0.01" min="0" defaultValue={5} className={inputClass} />
          </label>
          <label className={labelClass}>
            Cost
            <input type="number" name="cost" step="0.01" min="0" defaultValue={2} className={inputClass} />
          </label>
          <label className={labelClass}>
            Salvage
            <input type="number" name="salvage" step="0.01" min="0" defaultValue={0} className={inputClass} />
          </label>
          <label className={labelClass}>
            Rounds
            <input type="number" name="totalRounds" min="1" step="1" defaultValue={8} className={inputClass} />
          </label>
          <label className={labelClass}>
            Min demand
            <input type="number" name="demandMin" min="0" step="1" defaultValue={10} className={inputClass} />
          </label>
          <label className={labelClass}>
            Max demand
            <input type="number" name="demandMax" min="0" step="1" defaultValue={50} className={inputClass} />
          </label>
        </div>
      )}

      <button
        type="submit"
        className="mt-1 self-start rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        Create teams
      </button>
    </form>
  );
}
