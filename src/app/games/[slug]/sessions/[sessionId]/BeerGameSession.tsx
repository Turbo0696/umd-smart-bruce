import { notFound } from "next/navigation";
import { ROLE_ORDER } from "@/lib/beerGame";
import { getCurrentProfile } from "@/lib/auth";
import { LineChart } from "@/components/LineChart";
import { PollingRefresher } from "@/components/PollingRefresher";
import { prisma } from "@/lib/prisma";
import { joinAsParticipant, startSession, submitOrder } from "./actions";

const ROLE_COLORS: Record<string, string> = {
  RETAILER: "#2563eb",
  WHOLESALER: "#16a34a",
  DISTRIBUTOR: "#d97706",
  FACTORY: "#dc2626",
};

export async function BeerGameSession({
  slug,
  sessionId,
}: {
  slug: string;
  sessionId: string;
}) {
  const [session, profile] = await Promise.all([
    prisma.gameSession.findUnique({
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
        Join code: <span className="font-mono">{session.joinCode}</span>
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
  Awaited<ReturnType<typeof prisma.gameSession.findUnique>>
> & {
  game: { name: string };
  participants: Array<{
    id: string;
    role: string;
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
  const full = session.participants.length >= 4;
  const joinAction = joinAsParticipant.bind(null, slug, sessionId);
  const startAction = startSession.bind(null, slug, sessionId);

  return (
    <div className="mt-8">
      <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">
        Waiting room ({session.participants.length}/4)
      </h2>
      <ul className="mt-3 flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
        {ROLE_ORDER.map((role) => {
          const p = session.participants.find((p) => p.role === role);
          return (
            <li
              key={role}
              className="flex justify-between rounded border border-zinc-100 px-3 py-2 dark:border-zinc-800"
            >
              <span>{role}</span>
              <span className="text-zinc-500 dark:text-zinc-500">
                {p ? p.user.name ?? p.user.email : "open"}
              </span>
            </li>
          );
        })}
      </ul>

      {!viewerParticipant && isLoggedIn && !full && (
        <form action={joinAction} className="mt-4">
          <button
            type="submit"
            className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Join this session
          </button>
        </form>
      )}

      {!isLoggedIn && (
        <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-500">
          Log in to join.
        </p>
      )}

      {viewerParticipant && !full && (
        <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-500">
          You&apos;re in as <strong>{viewerParticipant.role}</strong>. Waiting
          for more players.
        </p>
      )}

      {canManage && full && (
        <form action={startAction} className="mt-4">
          <button
            type="submit"
            className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Start game
          </button>
        </form>
      )}

      {!canManage && full && !viewerParticipant?.role && (
        <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-500">
          This session is full.
        </p>
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
        This session is already in progress and you&apos;re not a participant.
      </p>
    );
  }

  const [latestRound, myPendingOrder] = await Promise.all([
    prisma.gameRoundState.findFirst({
      where: { participantId: viewerParticipant.id },
      orderBy: { round: "desc" },
    }),
    prisma.pendingOrder.findUnique({
      where: {
        participantId_round: {
          participantId: viewerParticipant.id,
          round: session.currentRound,
        },
      },
    }),
  ]);

  const submitAction = submitOrder.bind(null, slug, sessionId);
  const inventory = latestRound?.inventory ?? 12;
  const backlog = latestRound?.backlog ?? 0;
  const incomingOrderLastRound = latestRound?.incomingOrder;

  return (
    <div className="mt-8">
      <p className="text-sm text-zinc-500 dark:text-zinc-500">
        Round {session.currentRound} of {session.totalRounds} — your role:{" "}
        <strong>{viewerParticipant.role}</strong>
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Inventory" value={inventory} />
        <Stat label="Backlog" value={backlog} />
        {incomingOrderLastRound !== undefined && (
          <Stat label="Last incoming order" value={incomingOrderLastRound} />
        )}
      </div>

      {myPendingOrder ? (
        <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
          Order submitted ({myPendingOrder.amount} units). Waiting for other
          players to submit round {session.currentRound}...
        </p>
      ) : (
        <form action={submitAction} className="mt-6 flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Your order for round {session.currentRound}
            <input
              type="number"
              name="amount"
              min={0}
              step={1}
              required
              defaultValue={incomingOrderLastRound ?? 4}
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

  const rounds = await prisma.gameRoundState.findMany({
    where: { sessionId: session.id },
    orderBy: { round: "asc" },
  });

  const participantRole = new Map(session.participants.map((p) => [p.id, p.role]));
  const ordersByRole: Record<string, number[]> = {};
  const totalCostByRole: Record<string, number> = {};

  for (const role of ROLE_ORDER) {
    ordersByRole[role] = [];
    totalCostByRole[role] = 0;
  }
  for (const row of rounds) {
    const role = participantRole.get(row.participantId);
    if (!role) continue;
    ordersByRole[role][row.round - 1] = row.outgoingOrder;
    totalCostByRole[role] += row.cost;
  }

  return (
    <div className="mt-8">
      <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">
        Game complete — orders placed per round
      </h2>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-500">
        This is the bullwhip effect: watch how order variance grows as you
        move from Retailer toward Factory.
      </p>
      <div className="mt-6">
        <LineChart
          series={ROLE_ORDER.map((role) => ({
            label: role,
            color: ROLE_COLORS[role],
            points: ordersByRole[role].map((v) => v ?? 0),
          }))}
        />
      </div>

      <h3 className="mt-8 font-semibold text-zinc-900 dark:text-zinc-50">
        Total cost by role
      </h3>
      <table className="mt-3 w-full text-sm">
        <tbody>
          {ROLE_ORDER.map((role) => (
            <tr
              key={role}
              className="border-b border-zinc-100 dark:border-zinc-800"
            >
              <td className="py-2 text-zinc-700 dark:text-zinc-300">
                {role}
              </td>
              <td className="py-2 text-right text-zinc-900 dark:text-zinc-50">
                ${totalCostByRole[role].toFixed(2)}
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
