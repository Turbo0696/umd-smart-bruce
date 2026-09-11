/**
 * Rehearses the Sourcing Negotiation game's session lifecycle against a real
 * database, exercising the actual server actions rather than reimplementing
 * their logic here.
 *
 * WHY
 *   vitest.config.mts only includes src/**\/*.test.ts — no .tsx, no database.
 *   So none of this is reachable by `npm test`: the seat-management guards,
 *   the atomic session-start transaction, the RFQ stage-gating fix, and the
 *   roundMinutes overflow guard are all either DB-resident or (for the RFQ
 *   fix) JSX-resident. Reading the code is not the same as knowing it works —
 *   the kickToBot cross-session hole and the roundMinutes wedge were both
 *   invisible on the page and obvious the moment they actually ran.
 *
 * WHAT IT DOES
 *   Six numbered checks against
 *   src/app/games/[slug]/sessions/[sessionId]/negotiation-actions.ts:
 *     1. A 1-participant session plays through RFQ -> NEGOTIATION ->
 *        SETTLEMENT -> COMPLETED, and the recorded profit matches an
 *        independent recomputation from the pure engine.
 *     2. kickToBot rejects a dyad from a different session, and rejects an
 *        AGREED/terminal dyad (whether or not its session has completed).
 *     3. Two concurrent startSession calls on the same PENDING session
 *        produce exactly one set of dyads, not two.
 *     4. Two concurrent claimBotSeat calls by the same participant, for
 *        different-role seats in different dyads, leave them holding
 *        exactly one seat.
 *     5. An out-of-range roundMinutes (arriving via a session's raw config
 *        JSON, bypassing the create-form's own clamp) leaves the session
 *        startable, with roundDeadlineAt left null rather than an error.
 *     6. After one retailer submits an RFQ in a 2-dyad session, that dyad's
 *        rfqQuantities is set while its status is still AWAITING_RFQ — the
 *        state the RFQ-form gating fix keys off.
 *
 * HOW
 *   The action file is "use server" and imports next/cache and
 *   src/lib/auth.ts (itself pulling in next/headers via the Supabase server
 *   client) — neither resolves outside a running Next server. Following the
 *   precedent in scripts/generate-parity-fixture.mts (which has the same
 *   problem importing upstream's engine), this copies the CURRENT action
 *   file and its lib dependencies into a scratch directory and patches only
 *   those two imports to harness-local stand-ins; every other line is the
 *   real, unmodified source. If this file's import list changes, the PATCH
 *   list below is the first thing to check.
 *
 * SAFETY
 *   Unlike verify-cohort-migration.mjs, this can't wrap everything in one
 *   rolled-back transaction: the actions under test each manage their own
 *   transactions against the real `prisma` client. Instead, every row this
 *   script creates is deleted in a `finally` block, in dependency order,
 *   whether or not the checks pass. All created Profiles use an
 *   @verify-negotiation-harness.test email so they're easy to spot if
 *   cleanup is ever interrupted (Ctrl-C, a crash) — see the leftover check
 *   this script runs on exit.
 *
 * USAGE
 *   node --experimental-strip-types scripts/verify-negotiation-session.mjs
 *
 *   The flag is needed even though this entry file is .mjs: it dynamically
 *   imports the scratch copies (real .ts source, two imports patched — see
 *   HOW above), and Node's type-stripping loader applies per-process, not
 *   per-file. Needs DIRECT_URL or DATABASE_URL in .env, and the
 *   "negotiation-game" Game row seeded (node prisma/seed.mjs). Exits
 *   non-zero if any check fails.
 */

import "dotenv/config";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HARNESS_EMAIL_SUFFIX = "@verify-negotiation-harness.test";

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("No DIRECT_URL or DATABASE_URL in the environment.");
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString: url });
const prisma = new PrismaClient({ adapter });

const results = [];
function check(label, pass, detail = "") {
  results.push({ label, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
}
function checkThrows(label, fn) {
  return fn()
    .then(() => check(label, false, "expected a throw, but it succeeded"))
    .catch((err) => check(label, true, err instanceof Error ? err.message : String(err)));
}

// --- build the scratch copy: real source, two imports patched -------------

// Rooted alongside the repo (git-ignored, and cleaned up below regardless)
// rather than the OS temp dir: Node's package resolution walks UP from the
// importing file through ancestor node_modules folders, so this needs
// repoRoot/node_modules as an ancestor to find @prisma/client — a temp dir
// outside the repo entirely never would. It can't go INSIDE node_modules
// itself, though: Node explicitly refuses to type-strip .ts files there.
const scratchParent = join(repoRoot, ".verify-negotiation-scratch");
mkdirSync(scratchParent, { recursive: true });
const scratch = mkdtempSync(join(scratchParent, "run-"));

function copyPatched(relPath, patches) {
  const src = readFileSync(join(repoRoot, relPath), "utf8");
  let out = src.replace(/^"use server";\n/, "");
  for (const [from, to] of patches) {
    if (!out.includes(from)) {
      console.warn(`warning: expected import not found in ${relPath} — source may have changed: ${from}`);
    }
    out = out.replace(from, to);
  }
  const fileName = relPath.split("/").pop();
  writeFileSync(join(scratch, fileName), out);
}

writeFileSync(
  join(scratch, "prisma-shim.mjs"),
  `export { prisma } from ${JSON.stringify(pathToScratchPrisma())};\n`,
);
function pathToScratchPrisma() {
  // Re-exports the SAME PrismaClient instance this script already opened,
  // so the harness and the real actions share one connection pool instead
  // of each opening their own.
  const p = join(scratch, "prisma-instance.mjs");
  writeFileSync(p, `export const prisma = globalThis.__verifyPrisma;\n`);
  return "./prisma-instance.mjs";
}
globalThis.__verifyPrisma = prisma;

writeFileSync(
  join(scratch, "auth-shim.mjs"),
  // The real getCurrentProfile reads the request's Supabase session, which
  // doesn't exist here — the harness sets globalThis.__verifyProfile
  // immediately before each call to say who is "logged in" for it.
  `export async function getCurrentProfile() { return globalThis.__verifyProfile ?? null; }\n`,
);

writeFileSync(join(scratch, "cache-shim.mjs"), `export function revalidatePath() {}\n`);

copyPatched("src/lib/negotiation.ts", []); // zero imports — copies verbatim
copyPatched("src/lib/negotiationBot.ts", [['from "@/lib/negotiation"', 'from "./negotiation.ts"']]);
copyPatched("src/lib/negotiationGames.ts", [
  ['from "@/lib/prisma"', 'from "./prisma-shim.mjs"'],
  ['from "@/lib/negotiation"', 'from "./negotiation.ts"'],
]);
copyPatched("src/app/games/[slug]/sessions/[sessionId]/negotiation-actions.ts", [
  ['import { revalidatePath } from "next/cache";', 'import { revalidatePath } from "./cache-shim.mjs";'],
  ['import { getCurrentProfile } from "@/lib/auth";', 'import { getCurrentProfile } from "./auth-shim.mjs";'],
  ['from "@/lib/negotiation"', 'from "./negotiation.ts"'],
  ['from "@/lib/negotiationBot"', 'from "./negotiationBot.ts"'],
  ['from "@/lib/negotiationGames"', 'from "./negotiationGames.ts"'],
  ['from "@/lib/prisma"', 'from "./prisma-shim.mjs"'],
]);

// Dynamic import() needs a file:// URL, not a raw filesystem path — a bare
// Windows path like C:\... isn't a scheme import() understands.
function scratchImport(fileName) {
  return import(pathToFileURL(join(scratch, fileName)).href);
}

const actions = await scratchImport("negotiation-actions.ts");
const { negotiationDyad: NegDyad } = prisma; // just for brevity below

// --- harness helpers --------------------------------------------------------

async function asUser(profile, fn) {
  globalThis.__verifyProfile = profile;
  try {
    return await fn();
  } finally {
    globalThis.__verifyProfile = null;
  }
}

function harnessEmail(label) {
  return `${label}-${Math.random().toString(36).slice(2, 8)}${HARNESS_EMAIL_SUFFIX}`;
}

async function makeProfile(label, role) {
  return prisma.profile.create({ data: { email: harnessEmail(label), role } });
}

function joinCode() {
  return `V${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

async function makeSession({ instructorId, config } = {}) {
  const game = await prisma.game.findUniqueOrThrow({ where: { slug: "negotiation-game" } });
  return prisma.negotiationSession.create({
    data: { gameId: game.id, instructorId, joinCode: joinCode(), config: config ?? undefined },
  });
}

const createdProfileIds = [];
const createdSessionIds = [];

async function trackedProfile(label, role) {
  const p = await makeProfile(label, role);
  createdProfileIds.push(p.id);
  return p;
}
async function trackedSession(opts) {
  const s = await makeSession(opts);
  createdSessionIds.push(s.id);
  return s;
}

// --- 1. a full 1-participant playthrough, cross-checked against the engine

async function check1() {
  const instructor = await trackedProfile("t1-instructor", "INSTRUCTOR");
  const student = await trackedProfile("t1-student", "STUDENT");
  const session = await trackedSession({ instructorId: instructor.id });
  await prisma.negotiationParticipant.create({ data: { sessionId: session.id, userId: student.id } });

  await asUser(instructor, () => actions.startSession("negotiation-game", session.id));

  let s = await prisma.negotiationSession.findUniqueOrThrow({
    where: { id: session.id },
    include: { dyads: true },
  });
  const dyad = s.dyads[0];
  check("1a. startSession creates exactly one dyad for one participant", s.dyads.length === 1);

  const { DEFAULT_NEGOTIATION_CONFIG } = await scratchImport("negotiation.ts");
  const form1 = new FormData();
  DEFAULT_NEGOTIATION_CONFIG.monthlyDemand.forEach((v, i) => form1.set(`qty-${i}`, String(v)));
  await asUser(student, () => actions.submitRfq("negotiation-game", session.id, form1));

  s = await prisma.negotiationSession.findUniqueOrThrow({ where: { id: session.id } });
  check("1b. RFQ submission opens round 1", s.stage === "NEGOTIATION" && s.currentRound === 1);

  // The wholesaler seat is a bot (1 participant -> 1 dyad, one seat unfilled),
  // so it already proposed. Accept whatever round it takes to reach AGREED —
  // the bot never proposes a losing deal by the final round (see
  // negotiationBot.test.ts), so this always terminates well inside 10 rounds.
  for (let round = 1; round <= 10; round++) {
    const roundRow = await prisma.negotiationRound.findUnique({
      where: { dyadId_round: { dyadId: dyad.id, round } },
    });
    if (!roundRow || roundRow.proposalPrice == null) break;
    const form = new FormData();
    form.set("kind", "ACCEPT");
    await asUser(student, () => actions.submitResponse("negotiation-game", session.id, form));
    s = await prisma.negotiationSession.findUniqueOrThrow({ where: { id: session.id } });
    if (s.status !== "ACTIVE") break;
  }

  s = await prisma.negotiationSession.findUniqueOrThrow({ where: { id: session.id } });
  check("1c. accepting the bot's offer settles the game", s.status === "COMPLETED");

  const finalDyad = await prisma.negotiationDyad.findUniqueOrThrow({ where: { id: dyad.id } });
  const outcomes = await prisma.negotiationOutcome.findMany({ where: { dyadId: dyad.id } });
  const retailerOutcome = outcomes.find((o) => o.role === "RETAILER");
  check("1d. a RETAILER outcome row was written", !!retailerOutcome);

  if (retailerOutcome && finalDyad.agreedPrice != null && finalDyad.agreedQuantities) {
    const { retailerSettlement } = await scratchImport("negotiation.ts");
    const expected = retailerSettlement(finalDyad.agreedPrice, finalDyad.agreedQuantities, DEFAULT_NEGOTIATION_CONFIG);
    check(
      "1e. recorded retailer profit matches an independent recomputation from the engine",
      Math.abs(expected.profit - retailerOutcome.profit) < 1e-6,
      `expected ${expected.profit}, got ${retailerOutcome.profit}`,
    );
  } else {
    check("1e. recorded retailer profit matches an independent recomputation from the engine", false, "no agreed contract to check");
  }
}

// --- 2. kickToBot's guards: wrong session, and a terminal dyad -------------

async function check2() {
  const instructorA = await trackedProfile("t2a-instructor", "INSTRUCTOR");
  const studentA = await trackedProfile("t2a-student", "STUDENT");
  const sessionA = await trackedSession({ instructorId: instructorA.id });
  await prisma.negotiationParticipant.create({ data: { sessionId: sessionA.id, userId: studentA.id } });
  await asUser(instructorA, () => actions.startSession("negotiation-game", sessionA.id));
  const dyadA = (
    await prisma.negotiationSession.findUniqueOrThrow({ where: { id: sessionA.id }, include: { dyads: true } })
  ).dyads[0];

  const instructorB = await trackedProfile("t2b-instructor", "INSTRUCTOR");
  const studentB = await trackedProfile("t2b-student", "STUDENT");
  const sessionB = await trackedSession({ instructorId: instructorB.id });
  await prisma.negotiationParticipant.create({ data: { sessionId: sessionB.id, userId: studentB.id } });
  await asUser(instructorB, () => actions.startSession("negotiation-game", sessionB.id));
  const dyadB = (
    await prisma.negotiationSession.findUniqueOrThrow({ where: { id: sessionB.id }, include: { dyads: true } })
  ).dyads[0];

  await checkThrows("2a. kickToBot rejects a dyad from a different session", () =>
    asUser(instructorA, () => actions.kickToBot("negotiation-game", sessionA.id, dyadB.id, "RETAILER")),
  );

  // Drive dyadA's dyad to AGREED without settling the session, to test
  // kickToBot against an AGREED-but-not-yet-COMPLETED dyad.
  const { DEFAULT_NEGOTIATION_CONFIG } = await scratchImport("negotiation.ts");
  const form = new FormData();
  DEFAULT_NEGOTIATION_CONFIG.monthlyDemand.forEach((v, i) => form.set(`qty-${i}`, String(v)));
  await asUser(studentA, () => actions.submitRfq("negotiation-game", sessionA.id, form));

  for (let round = 1; round <= 10; round++) {
    const roundRow = await prisma.negotiationRound.findUnique({
      where: { dyadId_round: { dyadId: dyadA.id, round } },
    });
    if (!roundRow || roundRow.proposalPrice == null) break;
    const respForm = new FormData();
    respForm.set("kind", "ACCEPT");
    await asUser(studentA, () => actions.submitResponse("negotiation-game", sessionA.id, respForm));
    const s = await prisma.negotiationSession.findUniqueOrThrow({ where: { id: sessionA.id } });
    if (s.stage === "SETTLEMENT" || s.status !== "ACTIVE") break;
  }

  const agreedDyad = await prisma.negotiationDyad.findUniqueOrThrow({ where: { id: dyadA.id } });
  if (agreedDyad.status !== "AGREED") {
    check("2b. (setup) dyad reached AGREED before settlement", false, `status was ${agreedDyad.status}`);
  } else {
    await checkThrows("2b. kickToBot rejects an AGREED dyad's retailer seat", () =>
      asUser(instructorA, () => actions.kickToBot("negotiation-game", sessionA.id, dyadA.id, "RETAILER")),
    );
  }
}

// --- 3. two concurrent startSession calls -> exactly one set of dyads -----

async function check3() {
  const instructor = await trackedProfile("t3-instructor", "INSTRUCTOR");
  const student1 = await trackedProfile("t3-student1", "STUDENT");
  const student2 = await trackedProfile("t3-student2", "STUDENT");
  const session = await trackedSession({ instructorId: instructor.id });
  await prisma.negotiationParticipant.create({ data: { sessionId: session.id, userId: student1.id } });
  await prisma.negotiationParticipant.create({ data: { sessionId: session.id, userId: student2.id } });

  const outcomes = await asUser(instructor, () =>
    Promise.allSettled([
      actions.startSession("negotiation-game", session.id),
      actions.startSession("negotiation-game", session.id),
    ]),
  );
  const fulfilled = outcomes.filter((o) => o.status === "fulfilled").length;

  const dyads = await NegDyad.findMany({ where: { sessionId: session.id } });
  check(
    "3. two concurrent startSession calls leave exactly one set of dyads",
    dyads.length === 1,
    `${fulfilled} of 2 calls succeeded, ${dyads.length} dyad row(s) exist`,
  );
}

// --- 4. two concurrent claimBotSeat calls, different roles/dyads ----------

async function check4() {
  const instructor = await trackedProfile("t4-instructor", "INSTRUCTOR");
  const session = await trackedSession({ instructorId: instructor.id });
  // 4 seed participants -> 2 full dyads (2 participants would form only
  // ONE dyad with both its seats filled, not the two separate dyads this
  // check needs one open seat in each of).
  for (const label of ["t4-seed1", "t4-seed2", "t4-seed3", "t4-seed4"]) {
    const seed = await trackedProfile(label, "STUDENT");
    await prisma.negotiationParticipant.create({ data: { sessionId: session.id, userId: seed.id } });
  }
  await asUser(instructor, () => actions.startSession("negotiation-game", session.id));
  // Kick one seat in each dyad to bot so the claimant has something to race on.
  const dyads = await NegDyad.findMany({ where: { sessionId: session.id }, orderBy: { dyadNumber: "asc" } });
  await asUser(instructor, () => actions.kickToBot("negotiation-game", session.id, dyads[0].id, "RETAILER"));
  await asUser(instructor, () => actions.kickToBot("negotiation-game", session.id, dyads[1].id, "WHOLESALER"));

  const claimant = await trackedProfile("t4-claimant", "STUDENT");
  await asUser(claimant, () =>
    Promise.allSettled([
      actions.claimBotSeat("negotiation-game", session.id, dyads[0].id, "RETAILER"),
      actions.claimBotSeat("negotiation-game", session.id, dyads[1].id, "WHOLESALER"),
    ]),
  );

  const claimantParticipant = await prisma.negotiationParticipant.findUnique({
    where: { sessionId_userId: { sessionId: session.id, userId: claimant.id } },
  });
  const seatCount = await NegDyad.count({
    where: {
      sessionId: session.id,
      OR: [
        { retailerParticipantId: claimantParticipant?.id },
        { wholesalerParticipantId: claimantParticipant?.id },
      ],
    },
  });
  check(
    "4. two concurrent claimBotSeat calls leave the claimant holding exactly one seat",
    seatCount === 1,
    `held ${seatCount} seat(s)`,
  );
}

// --- 5. an out-of-range roundMinutes must not wedge the session -----------

async function check5() {
  const instructor = await trackedProfile("t5-instructor", "INSTRUCTOR");
  const student = await trackedProfile("t5-student", "STUDENT");
  const session = await trackedSession({ instructorId: instructor.id, config: { roundMinutes: 1e15 } });
  await prisma.negotiationParticipant.create({ data: { sessionId: session.id, userId: student.id } });

  let threw = false;
  try {
    await asUser(instructor, () => actions.startSession("negotiation-game", session.id));
  } catch {
    threw = true;
  }
  check("5a. startSession with an absurd roundMinutes does not throw", !threw);

  const s = await prisma.negotiationSession.findUniqueOrThrow({ where: { id: session.id }, include: { dyads: true } });
  check("5b. the session is ACTIVE, not wedged PENDING", s.status === "ACTIVE");
  check("5c. its dyads were created", s.dyads.length === 1);
  check("5d. roundDeadlineAt is null rather than an Invalid Date", s.roundDeadlineAt === null);
}

// --- 6. an RFQ submission's own dyad state, mid-stage -----------------------

async function check6() {
  const instructor = await trackedProfile("t6-instructor", "INSTRUCTOR");
  const students = await Promise.all(
    ["t6-student1", "t6-student2", "t6-student3", "t6-student4"].map((label) =>
      trackedProfile(label, "STUDENT"),
    ),
  );
  const session = await trackedSession({ instructorId: instructor.id });
  const participants = [];
  for (const p of students) {
    participants.push(
      await prisma.negotiationParticipant.create({ data: { sessionId: session.id, userId: p.id } }),
    );
  }
  await asUser(instructor, () => actions.startSession("negotiation-game", session.id));

  const s0 = await prisma.negotiationSession.findUniqueOrThrow({
    where: { id: session.id },
    include: { dyads: true },
  });
  check("6a. 4 participants form 2 dyads", s0.dyads.length === 2);

  const { DEFAULT_NEGOTIATION_CONFIG } = await scratchImport("negotiation.ts");
  const form = new FormData();
  DEFAULT_NEGOTIATION_CONFIG.monthlyDemand.forEach((v, i) => form.set(`qty-${i}`, String(v)));

  // shuffleSeeded's pairing (which student becomes which dyad's retailer) is
  // random and not something this harness controls — so it can't assume
  // which of the 4 profiles ended up seated where. Build the actual
  // participantId -> profile map instead of guessing between two candidates.
  const profileByParticipantId = new Map(participants.map((p, i) => [p.id, students[i]]));
  const dyadWithHumanRetailer = s0.dyads.find((d) => d.retailerParticipantId != null);
  const retailerProfile = dyadWithHumanRetailer
    ? profileByParticipantId.get(dyadWithHumanRetailer.retailerParticipantId)
    : undefined;

  if (!dyadWithHumanRetailer || !retailerProfile) {
    check("6b. (setup) at least one dyad has a human retailer seat", false);
  } else {
    await asUser(retailerProfile, () => actions.submitRfq("negotiation-game", session.id, form));

    const dyadAfter = await prisma.negotiationDyad.findUniqueOrThrow({
      where: { id: dyadWithHumanRetailer.id },
    });
    check("6b. the submitting retailer's dyad has rfqQuantities set", dyadAfter.rfqQuantities != null);
    check(
      "6c. that dyad's status is still AWAITING_RFQ — the other dyad hasn't submitted yet",
      dyadAfter.status === "AWAITING_RFQ",
    );
  }
}

// --- run everything, then clean up no matter what -------------------------

try {
  await check1();
  await check2();
  await check3();
  await check4();
  await check5();
  await check6();
} catch (err) {
  check("(unexpected) a check threw instead of failing cleanly", false, err instanceof Error ? err.stack : String(err));
} finally {
  for (const sessionId of createdSessionIds) {
    await prisma.negotiationOutcome.deleteMany({ where: { sessionId } });
    await prisma.negotiationDyadResult.deleteMany({ where: { dyad: { sessionId } } });
    await prisma.negotiationRound.deleteMany({ where: { sessionId } });
    await prisma.negotiationDyad.deleteMany({ where: { sessionId } });
    await prisma.negotiationParticipant.deleteMany({ where: { sessionId } });
  }
  await prisma.negotiationSession.deleteMany({ where: { id: { in: createdSessionIds } } });
  await prisma.profile.deleteMany({ where: { id: { in: createdProfileIds } } });

  const leftover = await prisma.profile.count({ where: { email: { endsWith: HARNESS_EMAIL_SUFFIX } } });
  if (leftover > 0) {
    console.warn(
      `warning: ${leftover} harness profile(s) from a previous interrupted run remain — ` +
        `delete manually with: DELETE FROM "Profile" WHERE email LIKE '%${HARNESS_EMAIL_SUFFIX}';`,
    );
  }

  rmSync(scratch, { recursive: true, force: true });
  await prisma.$disconnect();
}

const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} checks passed.`);
process.exit(failed > 0 ? 1 : 0);
