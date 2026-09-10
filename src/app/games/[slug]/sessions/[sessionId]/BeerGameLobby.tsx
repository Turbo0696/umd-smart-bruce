// SPDX-License-Identifier: CC-BY-SA-4.0
//
// Pre-game lobby. Roster monitoring, host-tunable parameters and the cohort
// preview follow siemsene/beergame's HostLobby. See NOTICE.md for attribution.

import { PollingRefresher } from "@/components/PollingRefresher";
import { ROBOT_NAME } from "@/lib/beerGame";
import { previewCohort } from "@/lib/beerGameTeams";
import {
  TOTAL_ROUNDS_MAX,
  TOTAL_ROUNDS_MIN,
  type BeerGameConfig,
} from "@/lib/beerGameConfig";
import {
  removeParticipant,
  startSession,
  updateBeerConfig,
} from "./actions";

export type LobbyMember = {
  id: string;
  displayName: string;
};

export function BeerGameLobby({
  slug,
  sessionId,
  members,
  config,
  totalRounds,
  viewerIsMember,
  canManage,
  isLoggedIn,
  joinAction,
}: {
  slug: string;
  sessionId: string;
  members: LobbyMember[];
  config: BeerGameConfig;
  totalRounds: number;
  viewerIsMember: boolean;
  canManage: boolean;
  isLoggedIn: boolean;
  joinAction: () => void | Promise<void>;
}) {
  const preview = previewCohort(members.length);
  const startAction = startSession.bind(null, slug, sessionId);
  const configAction = updateBeerConfig.bind(null, slug, sessionId);

  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">
          Waiting room — {members.length}{" "}
          {members.length === 1 ? "player" : "players"}
        </h2>
        {members.length > 0 && (
          <p className="text-sm text-zinc-500 dark:text-zinc-500">
            Will start as {preview.teams}{" "}
            {preview.teams === 1 ? "supply chain" : "supply chains"}
            {preview.robots > 0 && (
              <>
                {" "}
                with {preview.robots} {ROBOT_NAME}{" "}
                {preview.robots === 1 ? "player" : "players"}
              </>
            )}
          </p>
        )}
      </div>

      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Roles are assigned at random when the game starts, four players to a
        chain.
      </p>

      {members.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-500">
          Nobody has joined yet. Share the join code above.
        </p>
      ) : (
        <ul className="mt-3 grid gap-1 sm:grid-cols-2">
          {members.map((member) => (
            <li
              key={member.id}
              className="flex items-center justify-between gap-2 rounded border border-zinc-100 px-3 py-2 text-sm dark:border-zinc-800"
            >
              <span className="truncate text-zinc-700 dark:text-zinc-300">
                {member.displayName}
              </span>
              {canManage && (
                <form
                  action={removeParticipant.bind(
                    null,
                    slug,
                    sessionId,
                    member.id,
                  )}
                >
                  <button
                    type="submit"
                    className="shrink-0 rounded-full px-2 py-0.5 text-xs text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
                    title="Remove this player (useful for a duplicate sign-in)"
                  >
                    Remove
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      {!isLoggedIn && (
        <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-500">
          Log in to join.
        </p>
      )}

      {isLoggedIn && !viewerIsMember && (
        <form action={joinAction} className="mt-4">
          <button
            type="submit"
            className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Join this session
          </button>
        </form>
      )}

      {viewerIsMember && !canManage && (
        <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-500">
          You&apos;re in. Waiting for your instructor to start the game.
        </p>
      )}

      {canManage && (
        <>
          <details className="mt-8 rounded-lg border border-zinc-200 dark:border-zinc-800">
            <summary className="cursor-pointer px-5 py-3 text-sm font-medium text-zinc-900 dark:text-zinc-50">
              Game settings
            </summary>
            <form action={configAction} className="flex flex-col gap-4 px-5 pb-5">
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                These can only be changed before the game starts — the numbers
                have to hold still once rounds are on the record.
              </p>

              <div className="grid gap-3 sm:grid-cols-2">
                <NumberField
                  name="totalRounds"
                  label="Rounds"
                  defaultValue={totalRounds}
                  min={TOTAL_ROUNDS_MIN}
                  max={TOTAL_ROUNDS_MAX}
                  step={1}
                  hint="The classic game runs 40."
                />
                <NumberField
                  name="initialInventory"
                  label="Starting inventory"
                  defaultValue={config.initialInventory}
                  min={0}
                  step={1}
                  hint="Units on hand at every stage."
                />
                <NumberField
                  name="holdingCost"
                  label="Holding cost per unit"
                  defaultValue={config.holdingCost}
                  min={0}
                  step={0.05}
                  hint="Charged on inventory left at round end."
                />
                <NumberField
                  name="backorderCost"
                  label="Backorder cost per unit"
                  defaultValue={config.backorderCost}
                  min={0}
                  step={0.05}
                  hint="Charged on demand you couldn't fill."
                />
                <NumberField
                  name="pipelineSeed"
                  label="Units in transit at start"
                  defaultValue={config.pipelineSeed}
                  min={0}
                  step={1}
                  hint="Seeds the shipping pipeline for the first rounds."
                />
                <NumberField
                  name="demandStepRound"
                  label="Demand changes on round"
                  defaultValue={config.demandStepRound}
                  min={1}
                  step={1}
                  hint="When customer demand shifts."
                />
                <NumberField
                  name="demandInitial"
                  label="Customer demand before"
                  defaultValue={config.demandInitial}
                  min={0}
                  step={1}
                />
                <NumberField
                  name="demandFinal"
                  label="Customer demand after"
                  defaultValue={config.demandFinal}
                  min={0}
                  step={1}
                />
              </div>

              <CheckboxField
                name="extraOrderDelay"
                label="Extra order delay"
                defaultChecked={config.extraOrderDelay}
                hint="Orders reach your supplier a round later than usual, lengthening the information lag."
              />
              <CheckboxField
                name="showUpstreamBacklog"
                label="Show upstream backlog"
                defaultChecked={config.showUpstreamBacklog}
                hint="Players can see how far behind their supplier is."
              />

              <button
                type="submit"
                className="self-start rounded-full border border-zinc-300 px-5 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-800"
              >
                Save settings
              </button>
            </form>
          </details>

          <div className="mt-6 rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
            {members.length === 0 ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-500">
                You need at least one player before you can start.
              </p>
            ) : (
              <>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Starting draws {preview.teams}{" "}
                  {preview.teams === 1 ? "chain" : "chains"} at random from the{" "}
                  {members.length}{" "}
                  {members.length === 1 ? "player" : "players"} above
                  {preview.robots > 0 && (
                    <>
                      , filling {preview.robots} empty{" "}
                      {preview.robots === 1 ? "seat" : "seats"} with {ROBOT_NAME}
                    </>
                  )}
                  . Latecomers can still take over a {ROBOT_NAME} seat.
                </p>
                <form action={startAction} className="mt-3">
                  <button
                    type="submit"
                    className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
                  >
                    Start game
                  </button>
                </form>
              </>
            )}
          </div>
        </>
      )}

      <PollingRefresher />
    </div>
  );
}

function NumberField({
  name,
  label,
  defaultValue,
  min,
  max,
  step,
  hint,
}: {
  name: string;
  label: string;
  defaultValue: number;
  min?: number;
  max?: number;
  step?: number;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
      {label}
      <input
        type="number"
        name={name}
        defaultValue={defaultValue}
        min={min}
        max={max}
        step={step}
        className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
      />
      {hint && (
        <span className="text-xs text-zinc-500 dark:text-zinc-500">{hint}</span>
      )}
    </label>
  );
}

function CheckboxField({
  name,
  label,
  defaultChecked,
  hint,
}: {
  name: string;
  label: string;
  defaultChecked: boolean;
  hint?: string;
}) {
  return (
    <label className="flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="mt-0.5"
      />
      <span>
        {label}
        {hint && (
          <span className="block text-xs text-zinc-500 dark:text-zinc-500">
            {hint}
          </span>
        )}
      </span>
    </label>
  );
}
