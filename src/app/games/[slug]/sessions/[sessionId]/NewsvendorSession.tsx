import { notFound } from "next/navigation";
import { optimalOrderQty } from "@/lib/newsvendor";
import { getCurrentProfile } from "@/lib/auth";
import { LineChart } from "@/components/LineChart";
import { PollingRefresher } from "@/components/PollingRefresher";
import { prisma } from "@/lib/prisma";
import { joinAsParticipant, startSession, submitOrder } from "./newsvendor-actions";

const PARTICIPANT_COLORS = [
  "#2563eb",
  "#16a34a",
  "#d97706",
  "#dc2626",
  "#9333ea",
  "#0891b2",
];

export async function NewsvendorSession({
  slug,
  sessionId,
}: {
  slug: string;
  sessionId: string;
}) {
  const [session, profile] = await Promise.all([
    prisma.newsvendorSession.findUnique({
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
        price ${session.price} · cost ${session.cost} · salvage $
        {session.salvage} · demand {session.demandMin}–{session.demandMax}
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
        />
      )}

      {session.status === "COMPLETED" && (
        <CompletedView
          session={session}
          canView={!!viewerParticipant || canManage}
        />
      )}
    </div>
  );
}

type SessionWithParticipants = NonNullable<
  Awaited<ReturnType<typeof prisma.newsvendorSession.findUnique>>
> & {
  game: { name: string };
  participants: Array<{
    id: string;
    userId: string;
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
        Team roster ({session.participants.length} joined)
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
            className="rounded border border-zinc-100 px-3 py-2 dark:border-zinc-800"
          >
            {p.user.name ?? p.user.email}
          </li>
        ))}
      </ul>

      {!viewerParticipant && isLoggedIn && (
        <form action={joinAction} className="mt-4">
          <button
            type="submit"
            className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Join this team
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
          You&apos;re in. Waiting for the instructor to start.
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
}: {
  slug: string;
  sessionId: string;
  session: SessionWithParticipants;
  viewerParticipant: SessionWithParticipants["participants"][number] | undefined;
}) {
  if (!viewerParticipant) {
    return (
      <p className="mt-8 text-sm text-zinc-500 dark:text-zinc-500">
        This team is already in progress and you&apos;re not a participant.
      </p>
    );
  }

  const [lastResult, myPendingOrder] = await Promise.all([
    prisma.newsvendorRoundResult.findFirst({
      where: { participantId: viewerParticipant.id },
      orderBy: { round: "desc" },
    }),
    prisma.newsvendorPendingOrder.findUnique({
      where: {
        participantId_round: {
          participantId: viewerParticipant.id,
          round: session.currentRound,
        },
      },
    }),
  ]);

  const submitAction = submitOrder.bind(null, slug, sessionId);

  return (
    <div className="mt-8">
      <p className="text-sm text-zinc-500 dark:text-zinc-500">
        Round {session.currentRound} of {session.totalRounds}
      </p>

      {lastResult && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-500">
            Round {lastResult.round} result
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Demand was" value={lastResult.demand} />
            <Stat label="You sold" value={lastResult.sold} />
            <Stat label="Leftover" value={lastResult.leftover} />
            <Stat label="Shortage" value={lastResult.shortage} />
          </div>
          <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
            Profit: <strong>${lastResult.profit.toFixed(2)}</strong>
          </p>
        </div>
      )}

      {myPendingOrder ? (
        <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
          Order submitted ({myPendingOrder.amount} units). Waiting for other
          players to submit round {session.currentRound}...
        </p>
      ) : (
        <form action={submitAction} className="mt-6 flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            How many units will you order for round {session.currentRound}?
            <input
              type="number"
              name="amount"
              min={0}
              step={1}
              required
              defaultValue={lastResult?.orderQty ?? session.demandMin}
              className="w-32 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </label>
          <button
            type="submit"
            className="self-start rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Submit order
          </button>
        </form>
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

  const results = await prisma.newsvendorRoundResult.findMany({
    where: { sessionId: session.id },
    orderBy: { round: "asc" },
  });

  const userById = new Map(session.participants.map((p) => [p.id, p.user]));
  const profitByParticipant: Record<string, number[]> = {};
  const totalProfitByParticipant: Record<string, number> = {};

  for (const p of session.participants) {
    profitByParticipant[p.id] = [];
    totalProfitByParticipant[p.id] = 0;
  }
  for (const row of results) {
    profitByParticipant[row.participantId][row.round - 1] = row.profit;
    totalProfitByParticipant[row.participantId] += row.profit;
  }

  const optimal = optimalOrderQty({
    price: session.price,
    cost: session.cost,
    salvage: session.salvage,
    demandMin: session.demandMin,
    demandMax: session.demandMax,
  });

  const leaderboard = [...session.participants].sort(
    (a, b) => totalProfitByParticipant[b.id] - totalProfitByParticipant[a.id],
  );

  return (
    <div className="mt-8">
      <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">
        Game complete — profit per round
      </h2>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-500">
        The theoretical optimal order quantity for these parameters is{" "}
        <strong>{optimal} units</strong> (the classic newsvendor
        critical-ratio formula).
      </p>
      <div className="mt-6">
        <LineChart
          series={session.participants.map((p, i) => ({
            label: p.user.name ?? p.user.email,
            color: PARTICIPANT_COLORS[i % PARTICIPANT_COLORS.length],
            points: profitByParticipant[p.id].map((v) => v ?? 0),
          }))}
        />
      </div>

      <h3 className="mt-8 font-semibold text-zinc-900 dark:text-zinc-50">
        Total profit
      </h3>
      <table className="mt-3 w-full text-sm">
        <tbody>
          {leaderboard.map((p) => (
            <tr
              key={p.id}
              className="border-b border-zinc-100 dark:border-zinc-800"
            >
              <td className="py-2 text-zinc-700 dark:text-zinc-300">
                {userById.get(p.id)?.name ?? userById.get(p.id)?.email}
              </td>
              <td className="py-2 text-right text-zinc-900 dark:text-zinc-50">
                ${totalProfitByParticipant[p.id].toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <p className="text-xs text-zinc-500 dark:text-zinc-500">{label}</p>
      <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
        {value}
      </p>
    </div>
  );
}
