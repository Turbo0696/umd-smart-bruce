import { notFound } from "next/navigation";
import { configFromSession } from "@/lib/fishBanksGames";
import { getCurrentProfile } from "@/lib/auth";
import { LineChart } from "@/components/LineChart";
import { PollingRefresher } from "@/components/PollingRefresher";
import { prisma } from "@/lib/prisma";
import {
  forceResolveRound,
  joinAsParticipant,
  startSession,
  submitDecision,
} from "./fish-banks-actions";

const PARTICIPANT_COLORS = [
  "#2563eb",
  "#16a34a",
  "#d97706",
  "#dc2626",
  "#9333ea",
  "#0891b2",
];

export async function FishBanksSession({
  slug,
  sessionId,
}: {
  slug: string;
  sessionId: string;
}) {
  const [session, profile] = await Promise.all([
    prisma.fishBanksSession.findUnique({
      where: { id: sessionId },
      include: {
        game: true,
        participants: { include: { user: true } },
      },
    }),
    getCurrentProfile(),
  ]);

  if (!session || session.game.slug !== slug) {
    notFound();
  }

  const config = configFromSession(session);
  const viewerParticipant = profile
    ? session.participants.find((p) => p.userId === profile.id)
    : undefined;
  const canManage =
    !!profile &&
    (profile.id === session.instructorId || profile.role === "ADMIN");

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        {session.game.name}
      </h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-500">
        Join code: <span className="font-mono">{session.joinCode}</span> ·
        {" "}
        {session.totalRounds} rounds · starting cash $
        {config.startingCash.toLocaleString()} · starting ships{" "}
        {config.startingShips}
      </p>

      {session.status === "PENDING" && (
        <PendingView
          slug={slug}
          sessionId={sessionId}
          session={session}
          viewerParticipant={viewerParticipant}
          canManage={canManage}
          isLoggedIn={!!profile}
        />
      )}

      {session.status === "ACTIVE" && (
        <ActiveView
          slug={slug}
          sessionId={sessionId}
          session={session}
          viewerParticipant={viewerParticipant}
          canManage={canManage}
        />
      )}

      {session.status === "COMPLETED" && (
        <CompletedView session={session} canView={!!viewerParticipant || canManage} />
      )}
    </div>
  );
}

type SessionWithParticipants = NonNullable<
  Awaited<ReturnType<typeof prisma.fishBanksSession.findUnique>>
> & {
  game: { name: string };
  participants: Array<{
    id: string;
    userId: string;
    companyName: string;
    cash: number;
    ships: number;
    user: { name: string | null; email: string };
  }>;
};

function PendingView({
  slug,
  sessionId,
  session,
  viewerParticipant,
  canManage,
  isLoggedIn,
}: {
  slug: string;
  sessionId: string;
  session: SessionWithParticipants;
  viewerParticipant: SessionWithParticipants["participants"][number] | undefined;
  canManage: boolean;
  isLoggedIn: boolean;
}) {
  const joinAction = joinAsParticipant.bind(null, slug, sessionId);
  const startAction = startSession.bind(null, slug, sessionId);

  return (
    <div className="mt-8">
      <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">
        Teams ({session.participants.length} joined)
      </h2>
      <ul className="mt-3 flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
        {session.participants.length === 0 && (
          <li className="text-zinc-500 dark:text-zinc-500">
            No one has joined yet.
          </li>
        )}
        {session.participants.map((p) => (
          <li
            key={p.id}
            className="flex items-center justify-between rounded border border-zinc-100 px-3 py-2 dark:border-zinc-800"
          >
            <span>
              <strong>{p.companyName}</strong> —{" "}
              {p.user.name ?? p.user.email}
            </span>
          </li>
        ))}
      </ul>

      {!viewerParticipant && isLoggedIn && (
        <form action={joinAction} className="mt-4">
          <button
            type="submit"
            className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Join this fleet
          </button>
        </form>
      )}

      {!isLoggedIn && (
        <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-500">
          Log in to join.
        </p>
      )}

      {viewerParticipant && (
        <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-500">
          You&apos;re in as <strong>{viewerParticipant.companyName}</strong>.
          Waiting for the instructor to start.
        </p>
      )}

      {canManage && session.participants.length >= 1 && (
        <form action={startAction} className="mt-4">
          <button
            type="submit"
            className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Start game
          </button>
        </form>
      )}

      <PollingRefresher />
    </div>
  );
}

async function ActiveView({
  slug,
  sessionId,
  session,
  viewerParticipant,
  canManage,
}: {
  slug: string;
  sessionId: string;
  session: SessionWithParticipants;
  viewerParticipant: SessionWithParticipants["participants"][number] | undefined;
  canManage: boolean;
}) {
  const config = configFromSession(session);

  const [lastResult, myPendingDecision, pendingThisRound, lastMarketRound] = await Promise.all([
    viewerParticipant
      ? prisma.fishBanksTeamRound.findFirst({
          where: { participantId: viewerParticipant.id },
          orderBy: { round: "desc" },
        })
      : Promise.resolve(null),
    viewerParticipant
      ? prisma.fishBanksPendingDecision.findUnique({
          where: {
            participantId_round: {
              participantId: viewerParticipant.id,
              round: session.currentRound,
            },
          },
        })
      : Promise.resolve(null),
    prisma.fishBanksPendingDecision.findMany({ where: { sessionId, round: session.currentRound } }),
    prisma.fishBanksMarketRound.findFirst({
      where: { sessionId },
      orderBy: { round: "desc" },
    }),
  ]);

  const submitAction = submitDecision.bind(null, slug, sessionId);
  const forceAction = forceResolveRound.bind(null, slug, sessionId);
  const submittedIds = new Set(pendingThisRound.map((p) => p.participantId));

  return (
    <div className="mt-8">
      <p className="text-sm text-zinc-500 dark:text-zinc-500">
        Round {session.currentRound} of {session.totalRounds}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Coastal stock" value={`${Math.round(session.coastalStock)} t`} />
        <Stat label="Deep sea stock" value={`${Math.round(session.deepSeaStock)} t`} />
        <Stat
          label="Last price"
          value={lastMarketRound ? `$${lastMarketRound.price.toFixed(1)}/t` : "—"}
        />
      </div>

      {!viewerParticipant ? (
        <p className="mt-6 text-sm text-zinc-500 dark:text-zinc-500">
          This fleet is already underway and you&apos;re not a team in it.
        </p>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Your company" value={viewerParticipant.companyName} />
            <Stat label="Cash" value={`$${Math.round(viewerParticipant.cash).toLocaleString()}`} />
            <Stat label="Ships owned" value={viewerParticipant.ships} />
            <Stat
              label="Ship cost / scrap"
              value={`$${config.shipBuildCost} / $${config.shipScrapValue}`}
            />
          </div>

          {lastResult && (
            <div className="mt-4 rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800">
              <p className="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-500">
                Round {lastResult.round} result
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Catch" value={`${Math.round(lastResult.catchCoastal + lastResult.catchDeepSea)} t`} />
                <Stat label="Revenue" value={`$${Math.round(lastResult.revenue).toLocaleString()}`} />
                <Stat label="Costs" value={`$${Math.round(lastResult.operatingCost + lastResult.buildCost).toLocaleString()}`} />
                <Stat label="Profit" value={`$${Math.round(lastResult.profit).toLocaleString()}`} />
              </div>
            </div>
          )}

          {myPendingDecision ? (
            <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
              Decision submitted for round {session.currentRound} (
              {myPendingDecision.shipsCoastal} coastal, {myPendingDecision.shipsDeepSea}{" "}
              deep sea). Waiting on other teams...
            </p>
          ) : (
            <form action={submitAction} className="mt-6 flex flex-col gap-3">
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                Round {session.currentRound} decision — {viewerParticipant.ships} ship
                {viewerParticipant.ships === 1 ? "" : "s"} on hand
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <NumberField
                  name="shipsCoastal"
                  label="Send to coastal"
                  defaultValue={lastResult?.shipsCoastal ?? Math.ceil(viewerParticipant.ships / 2)}
                />
                <NumberField
                  name="shipsDeepSea"
                  label="Send to deep sea"
                  defaultValue={lastResult?.shipsDeepSea ?? Math.floor(viewerParticipant.ships / 2)}
                />
                <NumberField name="buildShips" label={`Build ($${config.shipBuildCost} ea)`} defaultValue={0} />
                <NumberField name="scrapShips" label={`Scrap ($${config.shipScrapValue} ea)`} defaultValue={0} />
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-500">
                If coastal + deep sea exceeds what you own after building/scrapping,
                it&apos;s scaled down automatically — you can&apos;t overcommit your fleet.
              </p>
              <button
                type="submit"
                className="self-start rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                Submit decision
              </button>
            </form>
          )}
        </>
      )}

      {canManage && (
        <div className="mt-8 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
            Instructor controls
          </p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
            {submittedIds.size} / {session.participants.length} teams have
            submitted round {session.currentRound}.
          </p>
          <form action={forceAction} className="mt-3">
            <button
              type="submit"
              className="rounded-full border border-zinc-300 px-4 py-1.5 text-sm font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-800"
            >
              Resolve round now (missing teams repeat their last move)
            </button>
          </form>
        </div>
      )}

      <PollingRefresher />
    </div>
  );
}

async function CompletedView({
  session,
  canView,
}: {
  session: SessionWithParticipants;
  canView: boolean;
}) {
  if (!canView) {
    return (
      <p className="mt-8 text-sm text-zinc-500 dark:text-zinc-500">
        This game has ended.
      </p>
    );
  }

  const [teamRounds, marketRounds] = await Promise.all([
    prisma.fishBanksTeamRound.findMany({
      where: { sessionId: session.id },
      orderBy: { round: "asc" },
    }),
    prisma.fishBanksMarketRound.findMany({
      where: { sessionId: session.id },
      orderBy: { round: "asc" },
    }),
  ]);

  const userById = new Map(session.participants.map((p) => [p.id, p]));
  const netWorthByParticipant: Record<string, number[]> = {};
  const finalNetWorth: Record<string, number> = {};

  for (const p of session.participants) {
    netWorthByParticipant[p.id] = [];
    finalNetWorth[p.id] = 0;
  }
  for (const row of teamRounds) {
    netWorthByParticipant[row.participantId][row.round - 1] = row.netWorth;
    finalNetWorth[row.participantId] = row.netWorth;
  }

  const leaderboard = [...session.participants].sort(
    (a, b) => finalNetWorth[b.id] - finalNetWorth[a.id],
  );

  const finalCoastal = marketRounds[marketRounds.length - 1]?.coastalStock ?? 0;
  const finalDeepSea = marketRounds[marketRounds.length - 1]?.deepSeaStock ?? 0;
  const collapsed = finalCoastal < 5 || finalDeepSea < 50;

  return (
    <div className="mt-8">
      <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">
        Game complete
      </h2>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-500">
        {collapsed
          ? "At least one fish stock is nearly wiped out — the classic Fishbanks outcome when the fleet grows faster than the stock can regrow."
          : "Both stocks are still in reasonable shape — this fleet managed the commons better than most."}
        {" "}Final coastal stock: {Math.round(finalCoastal)}t · final deep sea
        stock: {Math.round(finalDeepSea)}t.
      </p>

      <div className="mt-6">
        <p className="mb-2 text-sm font-medium text-zinc-900 dark:text-zinc-50">
          Net worth by round
        </p>
        <LineChart
          series={session.participants.map((p, i) => ({
            label: p.companyName,
            color: PARTICIPANT_COLORS[i % PARTICIPANT_COLORS.length],
            points: netWorthByParticipant[p.id].map((v) => v ?? 0),
          }))}
        />
      </div>

      <div className="mt-6">
        <p className="mb-2 text-sm font-medium text-zinc-900 dark:text-zinc-50">
          Fish stock by round
        </p>
        <LineChart
          series={[
            {
              label: "Coastal stock",
              color: "#0891b2",
              points: marketRounds.map((r) => r.coastalStock),
            },
            {
              label: "Deep sea stock",
              color: "#1d4ed8",
              points: marketRounds.map((r) => r.deepSeaStock),
            },
          ]}
        />
      </div>

      <h3 className="mt-8 font-semibold text-zinc-900 dark:text-zinc-50">
        Final standings (net worth)
      </h3>
      <table className="mt-3 w-full text-sm">
        <tbody>
          {leaderboard.map((p) => (
            <tr key={p.id} className="border-b border-zinc-100 dark:border-zinc-800">
              <td className="py-2 text-zinc-700 dark:text-zinc-300">
                {userById.get(p.id)?.companyName} —{" "}
                {userById.get(p.id)?.user.name ?? userById.get(p.id)?.user.email}
              </td>
              <td className="py-2 text-right text-zinc-900 dark:text-zinc-50">
                ${Math.round(finalNetWorth[p.id]).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
        step={1}
        defaultValue={defaultValue}
        className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
      />
    </label>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <p className="text-xs text-zinc-500 dark:text-zinc-500">{label}</p>
      <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
        {value}
      </p>
    </div>
  );
}
