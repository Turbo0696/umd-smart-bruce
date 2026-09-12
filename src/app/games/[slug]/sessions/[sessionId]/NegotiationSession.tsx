import { notFound } from "next/navigation";
import type { NegotiationRole } from "@prisma/client";
import { getCurrentProfile } from "@/lib/auth";
import { CountdownTimer } from "@/components/CountdownTimer";
import { centralizedOptimum, retailerSettlement, settleDyad, type NegotiationConfig } from "@/lib/negotiation";
import { configFromSession } from "@/lib/negotiationGames";
import { PollingRefresher } from "@/components/PollingRefresher";
import { prisma } from "@/lib/prisma";
import {
  claimBotSeat,
  forceAdvance,
  joinAsParticipant,
  kickToBot,
  refuseSettlement,
  startSession,
  submitProcurement,
  submitResponse,
} from "./negotiation-actions";
import { MonthlyBreakdownTable } from "./MonthlyBreakdownTable";
import { ProfitAllocationChart } from "./ProfitAllocationChart";
import { ProposalEstimator } from "./ProposalEstimator";
import { ReviseEstimator } from "./ReviseEstimator";
import { RfqEstimator } from "./RfqEstimator";

export async function NegotiationSession({
  slug,
  sessionId,
}: {
  slug: string;
  sessionId: string;
}) {
  const [session, profile] = await Promise.all([
    prisma.negotiationSession.findUnique({
      where: { id: sessionId },
      include: {
        game: true,
        participants: { include: { user: true } },
        dyads: {
          include: {
            retailer: { include: { user: true } },
            wholesaler: { include: { user: true } },
          },
          orderBy: { dyadNumber: "asc" },
        },
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
    !!profile && (profile.id === session.instructorId || profile.role === "ADMIN");

  const viewerDyad = viewerParticipant
    ? session.dyads.find(
        (d) =>
          d.retailerParticipantId === viewerParticipant.id ||
          d.wholesalerParticipantId === viewerParticipant.id,
      )
    : undefined;
  const viewerRole: NegotiationRole | undefined = viewerDyad
    ? viewerDyad.retailerParticipantId === viewerParticipant?.id
      ? "RETAILER"
      : "WHOLESALER"
    : undefined;

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        {session.game.name}
      </h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-500">
        Join code: <span className="font-mono">{session.joinCode}</span> ·{" "}
        {config.horizonLabels.length}-month horizon · {session.totalRounds} negotiation
        round{session.totalRounds === 1 ? "" : "s"}
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
          config={config}
          profileId={profile?.id}
          viewerParticipant={viewerParticipant}
          viewerDyad={viewerDyad}
          viewerRole={viewerRole}
          canManage={canManage}
        />
      )}

      {session.status === "COMPLETED" && (
        <CompletedView
          session={session}
          config={config}
          canView={!!viewerParticipant || canManage}
        />
      )}
    </div>
  );
}

type SessionWithDyads = NonNullable<
  Awaited<ReturnType<typeof prisma.negotiationSession.findUnique>>
> & {
  game: { name: string };
  participants: Array<{
    id: string;
    userId: string;
    user: { name: string | null; email: string };
  }>;
  dyads: Array<{
    id: string;
    dyadNumber: number;
    retailerFirmName: string;
    wholesalerFirmName: string;
    retailerParticipantId: string | null;
    wholesalerParticipantId: string | null;
    status: "AWAITING_RFQ" | "NEGOTIATING" | "AGREED" | "NO_DEAL";
    rfqQuantities: unknown;
    demandShared: boolean;
    agreedPrice: number | null;
    agreedQuantities: unknown;
    agreedAtRound: number | null;
    procurementSchedule: unknown;
    retailer: { user: { name: string | null; email: string } } | null;
    wholesaler: { user: { name: string | null; email: string } } | null;
  }>;
};

type Participant = SessionWithDyads["participants"][number];
type Dyad = SessionWithDyads["dyads"][number];

function asNumberArray(value: unknown): number[] | null {
  return Array.isArray(value) ? (value as number[]) : null;
}

function firmLabel(dyad: Dyad, role: NegotiationRole): string {
  const isBot =
    role === "RETAILER" ? dyad.retailerParticipantId == null : dyad.wholesalerParticipantId == null;
  const name = role === "RETAILER" ? dyad.retailerFirmName : dyad.wholesalerFirmName;
  const person = role === "RETAILER" ? dyad.retailer?.user : dyad.wholesaler?.user;
  if (isBot) return `${name} (bot)`;
  return person ? `${name} — ${person.name ?? person.email}` : name;
}

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
  session: SessionWithDyads;
  viewerParticipant: Participant | undefined;
  canManage: boolean;
  isLoggedIn: boolean;
}) {
  const joinAction = joinAsParticipant.bind(null, slug, sessionId);
  const startAction = startSession.bind(null, slug, sessionId);

  return (
    <div className="mt-8">
      <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">
        Roster ({session.participants.length} joined)
      </h2>
      <ul className="mt-3 flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
        {session.participants.length === 0 && (
          <li className="text-zinc-500 dark:text-zinc-500">No one has joined yet.</li>
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
      <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-500">
        Roles are assigned when the session starts: participants are paired
        off into fixed retailer/wholesaler dyads for the whole game. An odd
        participant, or any seat left over, is played by a bot.
      </p>

      {!viewerParticipant && isLoggedIn && (
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
        <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-500">Log in to join.</p>
      )}
      {viewerParticipant && (
        <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-500">
          You&apos;re on the roster. Waiting for the instructor to start.
        </p>
      )}

      {canManage && session.participants.length >= 1 && (
        <form action={startAction} className="mt-4">
          <button
            type="submit"
            className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Start session
          </button>
        </form>
      )}

      <PollingRefresher />
    </div>
  );
}

function ActiveView({
  slug,
  sessionId,
  session,
  config,
  profileId,
  viewerParticipant,
  viewerDyad,
  viewerRole,
  canManage,
}: {
  slug: string;
  sessionId: string;
  session: SessionWithDyads;
  config: NegotiationConfig;
  profileId: string | undefined;
  viewerParticipant: Participant | undefined;
  viewerDyad: Dyad | undefined;
  viewerRole: NegotiationRole | undefined;
  canManage: boolean;
}) {
  const claimAction = claimBotSeat.bind(null, slug, sessionId);
  const kickAction = kickToBot.bind(null, slug, sessionId);
  const forceAction = forceAdvance.bind(null, slug, sessionId);

  const openSeats = session.dyads.flatMap((d) => {
    const seats: { dyad: Dyad; role: NegotiationRole }[] = [];
    if (d.retailerParticipantId == null) seats.push({ dyad: d, role: "RETAILER" });
    if (d.wholesalerParticipantId == null) seats.push({ dyad: d, role: "WHOLESALER" });
    return seats;
  });

  const stageLabel =
    session.stage === "RFQ"
      ? "this stage"
      : session.stage === "NEGOTIATION"
        ? `round ${session.currentRound}`
        : "this stage";

  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-zinc-500 dark:text-zinc-500">
          {session.stage === "RFQ" && "Stage: requests for quotation"}
          {session.stage === "NEGOTIATION" &&
            `Stage: negotiation — round ${session.currentRound} of ${session.totalRounds}`}
          {session.stage === "SETTLEMENT" && "Stage: settlement"}
        </p>
        {session.roundDeadlineAt && !Number.isNaN(session.roundDeadlineAt.getTime()) && (
          // The isNaN check guards a row written before roundDeadlineFrom
          // gained its own bound — toISOString() throws RangeError on an
          // Invalid Date, which would otherwise 500 this whole page.
          <CountdownTimer deadline={session.roundDeadlineAt.toISOString()} label={stageLabel} />
        )}
      </div>

      {!viewerParticipant && profileId && openSeats.length > 0 && (
        <div className="mt-4 rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800">
          <p className="font-medium text-zinc-900 dark:text-zinc-50">
            Claim a seat
          </p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
            This session is underway, but some seats are still played by a
            bot — you can take one over.
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {openSeats.map(({ dyad, role }) => (
              <form key={`${dyad.id}-${role}`} action={claimAction.bind(null, dyad.id, role)}>
                <button
                  type="submit"
                  className="rounded-full border border-zinc-300 px-4 py-1.5 text-xs font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-800"
                >
                  Play {role === "RETAILER" ? dyad.retailerFirmName : dyad.wholesalerFirmName} (
                  {role.toLowerCase()})
                </button>
              </form>
            ))}
          </div>
        </div>
      )}

      {!viewerParticipant && !profileId && (
        <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-500">Log in to join.</p>
      )}

      {viewerDyad && viewerRole && (
        <DyadPanel
          slug={slug}
          sessionId={sessionId}
          session={session}
          config={config}
          dyad={viewerDyad}
          viewerRole={viewerRole}
        />
      )}

      {viewerParticipant && !viewerDyad && (
        <p className="mt-6 text-sm text-zinc-500 dark:text-zinc-500">
          You&apos;re on the roster but not seated in a dyad yet.
        </p>
      )}

      {canManage && (
        <HostConsole
          session={session}
          kickAction={kickAction}
          forceAction={forceAction}
        />
      )}

      <PollingRefresher />
    </div>
  );
}

async function DyadPanel({
  slug,
  sessionId,
  session,
  config,
  dyad,
  viewerRole,
}: {
  slug: string;
  sessionId: string;
  session: SessionWithDyads;
  config: NegotiationConfig;
  dyad: Dyad;
  viewerRole: NegotiationRole;
}) {
  const counterpartLabel = firmLabel(dyad, viewerRole === "RETAILER" ? "WHOLESALER" : "RETAILER");

  return (
    <div className="mt-6 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
        You are the {viewerRole.toLowerCase()} for {counterpartLabel}
      </p>

      {dyad.status === "NO_DEAL" && (
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          This negotiation ended without a contract.
        </p>
      )}

      {dyad.status === "AGREED" && session.stage !== "SETTLEMENT" && (
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          You reached an agreement in round {dyad.agreedAtRound} at $
          {dyad.agreedPrice?.toFixed(2)}/unit. Waiting for the other dyads to finish.
        </p>
      )}

      {dyad.status === "AWAITING_RFQ" && viewerRole === "RETAILER" && (
        dyad.rfqQuantities == null ? (
          <>
            <NegotiationReferenceInfo config={config} viewerRole="RETAILER" />
            <RfqEstimator slug={slug} sessionId={sessionId} dyadId={dyad.id} config={config} />
          </>
        ) : (
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Request submitted ({(asNumberArray(dyad.rfqQuantities) ?? []).join(", ")} units). Waiting
            for the other retailers to submit theirs.
          </p>
        )
      )}
      {dyad.status === "AWAITING_RFQ" && viewerRole === "WHOLESALER" && (
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Waiting for your retailer&apos;s request for quotation.
        </p>
      )}

      {dyad.status === "NEGOTIATING" && session.stage === "NEGOTIATION" && (
        <NegotiationRoundPanel
          slug={slug}
          sessionId={sessionId}
          session={session}
          config={config}
          dyad={dyad}
          viewerRole={viewerRole}
        />
      )}

      {dyad.status === "AGREED" && session.stage === "SETTLEMENT" && (
        <SettlementPanel slug={slug} sessionId={sessionId} dyad={dyad} viewerRole={viewerRole} config={config} />
      )}
    </div>
  );
}

// Static, server-rendered — the numbers a viewer already knows, shown
// together so they don't have to hold them all in their head while working
// out an offer. Role-aware: a retailer knows their own demand and logistics
// costs (never the wholesaler's manufacturer cost); a wholesaler knows their
// own cost and logistics, plus whatever the retailer's RFQ reveals — the
// RFQ's requested quantities always (that's the request being responded
// to), and the retailer's actual monthly demand only if they chose to share
// it (dyad.demandShared). Used at the RFQ stage and in every negotiation
// round after it, not just the one-time RFQ — the same numbers matter for
// deciding how to respond to an offer as they did for the initial request.
function NegotiationReferenceInfo({
  config,
  viewerRole,
  rfqQuantities,
  demandShared,
}: {
  config: NegotiationConfig;
  viewerRole: NegotiationRole;
  rfqQuantities?: number[] | null;
  demandShared?: boolean;
}) {
  const facts: { label: string; value: string }[] =
    viewerRole === "RETAILER"
      ? [
          ...config.horizonLabels.map((label, i) => ({
            label: `${label} demand`,
            value: `${config.monthlyDemand[i]} units`,
          })),
          { label: "Retail price", value: `$${config.retailPrice}/unit` },
          { label: "Salvage price", value: `$${config.salvagePrice}/unit` },
          { label: "Your order cost", value: `$${config.retailerOrderCost}/order` },
          { label: "Your holding cost", value: `$${config.retailerHoldingCost}/unit/month` },
        ]
      : [
          ...(rfqQuantities
            ? [{ label: "Retailer's RFQ", value: `${rfqQuantities.join(", ")} units` }]
            : []),
          ...(demandShared
            ? [{ label: "Retailer's actual demand", value: `${config.monthlyDemand.join(", ")} units` }]
            : []),
          { label: "Retail price", value: `$${config.retailPrice}/unit` },
          { label: "Salvage price", value: `$${config.salvagePrice}/unit` },
          { label: "Your manufacturer cost", value: `$${config.manufacturerCost}/unit` },
          { label: "Your order cost", value: `$${config.wholesalerOrderCost}/order` },
          { label: "Your holding cost", value: `$${config.wholesalerHoldingCost}/unit/month` },
        ];

  return (
    <div className="mt-3 rounded-md border border-zinc-100 p-3 text-xs dark:border-zinc-800">
      <p className="font-medium text-zinc-700 dark:text-zinc-300">Your information</p>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {facts.map((f) => (
          <div key={f.label}>
            <p className="text-zinc-500 dark:text-zinc-500">{f.label}</p>
            <p className="text-zinc-900 dark:text-zinc-50">{f.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

async function NegotiationRoundPanel({
  slug,
  sessionId,
  session,
  config,
  dyad,
  viewerRole,
}: {
  slug: string;
  sessionId: string;
  session: SessionWithDyads;
  config: NegotiationConfig;
  dyad: Dyad;
  viewerRole: NegotiationRole;
}) {
  const [currentRound, priorRounds] = await Promise.all([
    prisma.negotiationRound.findUnique({
      where: { dyadId_round: { dyadId: dyad.id, round: session.currentRound } },
    }),
    prisma.negotiationRound.findMany({
      where: { dyadId: dyad.id, round: { lt: session.currentRound } },
      orderBy: { round: "asc" },
    }),
  ]);

  const isFinalRound = session.currentRound >= config.totalRounds;

  return (
    <div className="mt-3 flex flex-col gap-4">
      <NegotiationReferenceInfo
        config={config}
        viewerRole={viewerRole}
        rfqQuantities={asNumberArray(dyad.rfqQuantities)}
        demandShared={dyad.demandShared}
      />

      {priorRounds.length > 0 && <Transcript rounds={priorRounds} config={config} />}

      {!currentRound && (
        <p className="text-sm text-zinc-500 dark:text-zinc-500">
          Waiting for round {session.currentRound} to open.
        </p>
      )}

      {currentRound && viewerRole === "WHOLESALER" && currentRound.proposalPrice == null && (
        <ProposalEstimator
          slug={slug}
          sessionId={sessionId}
          config={config}
          rfqQuantities={asNumberArray(dyad.rfqQuantities)}
          lastRequestedPrice={priorRounds.at(-1)?.requestedPrice ?? null}
          lastRequestedQuantities={asNumberArray(priorRounds.at(-1)?.requestedQuantities)}
        />
      )}

      {currentRound && viewerRole === "WHOLESALER" && currentRound.proposalPrice != null && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Waiting for your retailer&apos;s response to round {session.currentRound}.
        </p>
      )}

      {currentRound && viewerRole === "RETAILER" && currentRound.proposalPrice == null && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Waiting for your wholesaler&apos;s offer for round {session.currentRound}.
        </p>
      )}

      {currentRound && viewerRole === "RETAILER" && currentRound.proposalPrice != null && currentRound.responseKind == null && (
        <ResponseForm
          slug={slug}
          sessionId={sessionId}
          config={config}
          round={currentRound}
          isFinalRound={isFinalRound}
        />
      )}

      {currentRound && viewerRole === "RETAILER" && currentRound.proposalPrice != null && currentRound.responseKind != null && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Response sent for round {session.currentRound}. Waiting for the other dyads to finish this round.
        </p>
      )}
    </div>
  );
}

function ResponseForm({
  slug,
  sessionId,
  config,
  round,
  isFinalRound,
}: {
  slug: string;
  sessionId: string;
  config: NegotiationConfig;
  round: { proposalPrice: number | null; proposalQuantities: unknown; proposalNote: string | null };
  isFinalRound: boolean;
}) {
  const action = submitResponse.bind(null, slug, sessionId);
  const quantities = asNumberArray(round.proposalQuantities) ?? [];
  // The offer on the table is real, not hypothetical, so accepting it as-is
  // is a plain server-side computation — nothing to experiment with, unlike
  // the revise path below.
  const acceptEstimate =
    round.proposalPrice != null ? retailerSettlement(round.proposalPrice, quantities, config) : null;

  return (
    <form action={action} className="flex flex-col gap-3 rounded-md border border-zinc-100 p-3 dark:border-zinc-800">
      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
        Their offer: ${round.proposalPrice?.toFixed(2)}/unit, {quantities.join(", ")} units
      </p>
      {acceptEstimate && (
        <>
          <p className="text-xs text-zinc-500 dark:text-zinc-500">
            If you accept this exactly as offered, your estimated profit: $
            {Math.round(acceptEstimate.profit).toLocaleString()}
            {acceptEstimate.unmetDemand > 0 &&
              ` (${acceptEstimate.unmetDemand} units of demand would go unmet)`}
          </p>
          <MonthlyBreakdownTable
            horizonLabels={config.horizonLabels}
            need={config.monthlyDemand}
            supply={quantities}
            needLabel="Your demand"
            supplyLabel="Their offer"
          />
        </>
      )}
      {round.proposalNote && (
        <p className="rounded bg-zinc-50 p-2 text-xs text-zinc-600 dark:bg-zinc-800/60 dark:text-zinc-400">
          &quot;{round.proposalNote}&quot;
        </p>
      )}

      {!isFinalRound && (
        <div className="rounded-md border border-dashed border-zinc-200 p-3 dark:border-zinc-700">
          <p className="text-xs text-zinc-500 dark:text-zinc-500">
            If you request a revision, ask for:
          </p>
          <ReviseEstimator
            config={config}
            initialPrice={round.proposalPrice}
            initialQuantities={quantities.length ? quantities : config.monthlyDemand}
          />
        </div>
      )}

      {isFinalRound && (
        <p className="text-xs text-zinc-500 dark:text-zinc-500">
          This is the final round — you may only accept this exact offer or
          end the negotiation without a contract.
        </p>
      )}

      {config.allowNotes && <NoteField maxLength={config.noteMaxLength} />}

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          name="kind"
          value="ACCEPT"
          className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Accept this offer
        </button>
        <button
          type="submit"
          name="kind"
          value={isFinalRound ? "REJECT" : "REVISE"}
          className="rounded-full border border-zinc-300 px-5 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-800"
        >
          {isFinalRound ? "Reject — end without a contract" : "Send counter-proposal"}
        </button>
      </div>
    </form>
  );
}

function SettlementPanel({
  slug,
  sessionId,
  dyad,
  viewerRole,
  config,
}: {
  slug: string;
  sessionId: string;
  dyad: Dyad;
  viewerRole: NegotiationRole;
  config: NegotiationConfig;
}) {
  const refuseAction = refuseSettlement.bind(null, slug, sessionId);

  if (viewerRole === "RETAILER") {
    return (
      <>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Your wholesaler is finalizing their procurement schedule. Nothing
          more to do on your end.
        </p>
        <RefuseContractForm action={refuseAction} />
      </>
    );
  }

  if (dyad.procurementSchedule != null) {
    return (
      <>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Procurement schedule submitted. Waiting for other dyads to finish.
        </p>
        <RefuseContractForm action={refuseAction} />
      </>
    );
  }

  const agreedQuantities = asNumberArray(dyad.agreedQuantities) ?? config.monthlyDemand;
  const action = submitProcurement.bind(null, slug, sessionId);

  return (
    <>
      <form action={action} className="mt-3 flex flex-col gap-3">
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          You agreed to deliver {agreedQuantities.join(", ")} units. Decide how
          much to order from your manufacturer, and when — you can consolidate
          orders, but your running total on hand must always cover what
          you&apos;ve committed to deliver by that point.
        </p>
        <QuantityFields
          namePrefix="qty-"
          horizonLabels={config.horizonLabels}
          defaultValues={agreedQuantities}
        />
        <button
          type="submit"
          className="self-start rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Submit procurement schedule
        </button>
      </form>
      <RefuseContractForm action={refuseAction} />
    </>
  );
}

function RefuseContractForm({ action }: { action: () => Promise<void> }) {
  return (
    <form action={action} className="mt-3">
      <p className="text-xs text-zinc-500 dark:text-zinc-500">
        Changed your mind? You can still walk away — this ends the deal with
        no profit for either side, the same as a negotiation that never
        closed.
      </p>
      <button
        type="submit"
        className="mt-2 rounded-full border border-zinc-300 px-4 py-1.5 text-sm font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-800"
      >
        Refuse this contract
      </button>
    </form>
  );
}

function Transcript({
  rounds,
  config,
}: {
  rounds: Array<{
    round: number;
    proposalPrice: number | null;
    proposalQuantities: unknown;
    proposalNote: string | null;
    responseKind: string | null;
    requestedPrice: number | null;
    requestedQuantities: unknown;
    responseNote: string | null;
  }>;
  config: NegotiationConfig;
}) {
  return (
    <details className="rounded-md border border-zinc-100 p-3 text-xs dark:border-zinc-800">
      <summary className="cursor-pointer text-zinc-600 dark:text-zinc-400">
        Earlier rounds ({rounds.length})
      </summary>
      <div className="mt-2 flex flex-col gap-2">
        {rounds.map((r) => (
          <div key={r.round} className="rounded bg-zinc-50 p-2 dark:bg-zinc-800/60">
            <p className="font-medium text-zinc-700 dark:text-zinc-300">Round {r.round}</p>
            <p className="text-zinc-600 dark:text-zinc-400">
              Offered ${r.proposalPrice?.toFixed(2)}/unit,{" "}
              {(asNumberArray(r.proposalQuantities) ?? []).join(", ")} units
              {r.proposalNote ? ` — "${r.proposalNote}"` : ""}
            </p>
            {r.responseKind && (
              <p className="text-zinc-600 dark:text-zinc-400">
                Response: {r.responseKind}
                {r.responseKind === "REVISE" &&
                  ` — requested $${r.requestedPrice?.toFixed(2)}/unit, ${(
                    asNumberArray(r.requestedQuantities) ?? []
                  ).join(", ")} units`}
                {r.responseNote ? ` — "${r.responseNote}"` : ""}
              </p>
            )}
          </div>
        ))}
      </div>
      <p className="mt-2 text-zinc-400 dark:text-zinc-600">
        {config.horizonLabels.join(", ")}
      </p>
    </details>
  );
}

function HostConsole({
  session,
  kickAction,
  forceAction,
}: {
  session: SessionWithDyads;
  kickAction: (dyadId: string, role: NegotiationRole) => Promise<void>;
  forceAction: () => Promise<void>;
}) {
  return (
    <div className="mt-8 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
        Instructor controls
      </p>

      <div className="mt-3 flex flex-col gap-2">
        {session.dyads.map((d) => (
          <div
            key={d.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded border border-zinc-100 px-3 py-2 text-xs dark:border-zinc-800"
          >
            <span className="text-zinc-700 dark:text-zinc-300">
              #{d.dyadNumber}: {firmLabel(d, "RETAILER")} ↔ {firmLabel(d, "WHOLESALER")} —{" "}
              <strong>{d.status}</strong>
              {d.status === "AGREED" && d.agreedPrice != null && (
                <> at ${d.agreedPrice.toFixed(2)}/unit (round {d.agreedAtRound})</>
              )}
            </span>
            {(d.status === "AWAITING_RFQ" || d.status === "NEGOTIATING") && (
              <div className="flex gap-2">
                {d.retailerParticipantId != null && (
                  <form action={kickAction.bind(null, d.id, "RETAILER")}>
                    <button className="rounded border border-zinc-300 px-2 py-1 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800">
                      Bot-fill retailer
                    </button>
                  </form>
                )}
                {d.wholesalerParticipantId != null && (
                  <form action={kickAction.bind(null, d.id, "WHOLESALER")}>
                    <button className="rounded border border-zinc-300 px-2 py-1 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800">
                      Bot-fill wholesaler
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <form action={forceAction} className="mt-4">
        <button
          type="submit"
          className="rounded-full border border-zinc-300 px-4 py-1.5 text-sm font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-800"
        >
          Resolve everything stalled right now
        </button>
      </form>
      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-500">
        Fills in a scripted move for every seat still holding up the game —
        human or bot. There is no automatic timer: a round whose clock runs
        out does not resolve on its own, so this is how you move it along.
      </p>
    </div>
  );
}


async function CompletedView({
  session,
  config,
  canView,
}: {
  session: SessionWithDyads;
  config: NegotiationConfig;
  canView: boolean;
}) {
  if (!canView) {
    return (
      <p className="mt-8 text-sm text-zinc-500 dark:text-zinc-500">
        This game has ended.
      </p>
    );
  }

  const dyadIds = session.dyads.map((d) => d.id);
  const [outcomes, results] = await Promise.all([
    prisma.negotiationOutcome.findMany({
      where: { sessionId: session.id },
      include: { participant: { include: { user: true } } },
    }),
    prisma.negotiationDyadResult.findMany({ where: { dyadId: { in: dyadIds } } }),
  ]);

  const resultByDyad = new Map(results.map((r) => [r.dyadId, r]));
  const retailers = outcomes.filter((o) => o.role === "RETAILER").sort((a, b) => b.profit - a.profit);
  const wholesalers = outcomes.filter((o) => o.role === "WHOLESALER").sort((a, b) => b.profit - a.profit);

  const dealtCount = session.dyads.filter((d) => d.status === "AGREED").length;
  const centralizedProfit = results[0]?.centralizedProfit ?? centralizedOptimum(config).profit;

  // NegotiationOutcome rows only exist for human-seated participants (see
  // tryAdvanceStage), so a bot-involving dyad has no stored per-role profit
  // to read back. settleDyad is pure and cheap, and the dyad already has
  // every input it needs (agreedPrice/Quantities, procurementSchedule) —
  // recomputing here gets the retailer/wholesaler split for every dyad
  // uniformly, bot or human, the same way the settlement stage itself did.
  const dyadProfitBars = session.dyads.map((d) => {
    const settlement = settleDyad(
      d.status === "AGREED" ? "AGREED" : "NO_DEAL",
      d.agreedPrice,
      asNumberArray(d.agreedQuantities),
      asNumberArray(d.procurementSchedule),
      config,
    );
    return {
      label: `#${d.dyadNumber}`,
      retailerProfit: settlement.retailer.profit,
      wholesalerProfit: settlement.wholesaler.profit,
    };
  });

  return (
    <div className="mt-8">
      <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">Session complete</h2>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-500">
        {dealtCount} of {session.dyads.length} dyad{session.dyads.length === 1 ? "" : "s"} reached
        a contract. A single vertically-integrated firm facing this same
        demand and these same costs would have made $
        {Math.round(centralizedProfit).toLocaleString()} — the negotiated
        price itself never changes that number, since it&apos;s just a
        transfer between the two sides. The gap between what a dyad actually
        made and that figure is the cost of not being one company.
      </p>

      <div className="mt-6">
        <p className="mb-2 text-sm font-medium text-zinc-900 dark:text-zinc-50">
          Profit by dyad — retailer vs. wholesaler, vs. the centralized optimum
        </p>
        <ProfitAllocationChart maxLabel="Max" maxValue={centralizedProfit} dyads={dyadProfitBars} />
      </div>

      <div className="mt-6">
        <p className="mb-2 text-sm font-medium text-zinc-900 dark:text-zinc-50">
          Negotiated price by dyad
        </p>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-500">
              <th className="py-2 font-medium">Dyad</th>
              <th className="py-2 font-medium">Retailer ↔ Wholesaler</th>
              <th className="py-2 text-right font-medium">Price</th>
            </tr>
          </thead>
          <tbody>
            {session.dyads.map((d) => (
              <tr key={d.id} className="border-b border-zinc-100 dark:border-zinc-800">
                <td className="py-2 text-zinc-700 dark:text-zinc-300">#{d.dyadNumber}</td>
                <td className="py-2 text-zinc-700 dark:text-zinc-300">
                  {firmLabel(d, "RETAILER")} ↔ {firmLabel(d, "WHOLESALER")}
                </td>
                <td className="py-2 text-right text-zinc-900 dark:text-zinc-50">
                  {d.agreedPrice != null ? `$${d.agreedPrice.toFixed(2)}/unit` : "no contract"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="mt-8 font-semibold text-zinc-900 dark:text-zinc-50">Best retailers</h3>
      <Leaderboard rows={retailers} />

      <h3 className="mt-6 font-semibold text-zinc-900 dark:text-zinc-50">Best wholesalers</h3>
      <Leaderboard rows={wholesalers} />

      <div className="mt-6 flex flex-col gap-2 text-sm">
        {session.dyads.map((d) => {
          const result = resultByDyad.get(d.id);
          if (!result) return null;
          return (
            <div
              key={d.id}
              className="rounded border border-zinc-100 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-800 dark:text-zinc-400"
            >
              #{d.dyadNumber} {firmLabel(d, "RETAILER")} ↔ {firmLabel(d, "WHOLESALER")}:{" "}
              {result.dealt
                ? `agreed at $${d.agreedPrice?.toFixed(2)}/unit — ${Math.round(
                    result.efficiency * 100,
                  )}% of the centralized optimum`
                : "no contract"}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Leaderboard({
  rows,
}: {
  rows: Array<{
    id: string;
    dealt: boolean;
    profit: number;
    isBot: boolean;
    unitsSold: number;
    unmetDemand: number;
    participant: { user: { name: string | null; email: string } } | null;
  }>;
}) {
  if (rows.length === 0) {
    return <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-500">No human seats to rank.</p>;
  }
  return (
    <table className="mt-3 w-full text-sm">
      <thead>
        <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-500">
          <th className="py-2 font-medium">Participant</th>
          <th className="py-2 text-right font-medium">Profit</th>
          <th className="py-2 text-right font-medium">Demand met</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          // Ranked by profit, same as before — this column doesn't change the
          // ranking, it just makes visible that profit and demand-matching
          // aren't the same thing, so a high-profit row that skimped on
          // demand still shows the tradeoff plainly rather than hiding it.
          const faced = row.unitsSold + row.unmetDemand;
          const demandMetPct = faced > 0 ? Math.round((row.unitsSold / faced) * 100) : null;
          return (
            <tr key={row.id} className="border-b border-zinc-100 dark:border-zinc-800">
              <td className="py-2 text-zinc-700 dark:text-zinc-300">
                {row.participant ? row.participant.user.name ?? row.participant.user.email : "Bot"}
              </td>
              <td className="py-2 text-right text-zinc-900 dark:text-zinc-50">
                ${Math.round(row.profit).toLocaleString()}
              </td>
              <td
                className={`py-2 text-right ${
                  demandMetPct != null && demandMetPct < 100
                    ? "font-medium text-amber-600 dark:text-amber-400"
                    : "text-zinc-900 dark:text-zinc-50"
                }`}
              >
                {demandMetPct != null ? `${demandMetPct}%` : "—"}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function QuantityFields({
  namePrefix,
  horizonLabels,
  defaultValues,
}: {
  namePrefix: string;
  horizonLabels: string[];
  defaultValues: number[];
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {horizonLabels.map((label, i) => (
        <label key={label} className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
          {label}
          <input
            type="number"
            name={`${namePrefix}${i}`}
            min={0}
            step={1}
            defaultValue={defaultValues[i] ?? 0}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>
      ))}
    </div>
  );
}

function NoteField({ maxLength }: { maxLength: number }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
      Note (optional)
      <textarea
        name="note"
        maxLength={maxLength}
        rows={2}
        className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
      />
    </label>
  );
}
