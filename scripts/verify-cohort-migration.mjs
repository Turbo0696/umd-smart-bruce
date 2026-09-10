/**
 * Rehearses prisma/sql/beer-game-cohorts.sql without changing anything.
 *
 * WHY
 *   That script is DDL against a live database: it drops GameParticipant.role
 *   and makes two columns NOT NULL. Reading it is not the same as knowing what
 *   it does — both bugs it has had so far (a team invented for sessions with no
 *   history, and a second run failing on the dropped column) were invisible on
 *   the page and obvious the moment it ran.
 *
 * WHAT IT DOES
 *   Builds a pre-cohort replica of the four Beer Game tables inside a scratch
 *   schema, seeds it with the two cases that matter — a session with gameplay
 *   history, and an untouched PENDING session — runs the migration against it
 *   twice, asserts the outcome, then ROLLBACKs.
 *
 * SAFETY
 *   Everything happens in one transaction that always rolls back, and
 *   search_path deliberately excludes `public`, so no unqualified statement in
 *   the migration can reach the real tables even if this script were wrong.
 *   Your data is not read and not written.
 *
 * USAGE
 *   node scripts/verify-cohort-migration.mjs [path/to/migration.sql]
 *
 *   Needs DIRECT_URL (or DATABASE_URL) in .env — any database will do, since
 *   the replica is built from scratch. Exits non-zero if any assertion fails.
 */

import "dotenv/config";
import fs from "node:fs";
import pg from "pg";

const SQL_PATH = process.argv[2] ?? "prisma/sql/beer-game-cohorts.sql";
const SCHEMA = `verify_cohorts_${process.pid}`;

// The migration drives its own transaction; this harness needs to own it so it
// can roll back, so BEGIN/COMMIT are stripped and the body runs inside ours.
const migration = fs
  .readFileSync(SQL_PATH, "utf8")
  .split(/\r?\n/)
  .filter((line) => !/^\s*(BEGIN|COMMIT)\s*;\s*$/i.test(line))
  .join("\n");

const results = [];
const check = (label, pass, detail = "") => {
  results.push({ label, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
};

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("No DIRECT_URL or DATABASE_URL in the environment.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();

try {
  await client.query("BEGIN");
  await client.query(`CREATE SCHEMA "${SCHEMA}"`);
  // public is NOT on the path: the migration's unqualified identifiers can only
  // ever resolve to the scratch replica.
  await client.query(`SET LOCAL search_path TO "${SCHEMA}", extensions, pg_catalog`);

  // --- the schema as it looks before the cohort change -----------------------
  await client.query(
    `CREATE TYPE "BeerGameRole" AS ENUM ('RETAILER','WHOLESALER','DISTRIBUTOR','FACTORY')`,
  );
  await client.query(`
    CREATE TABLE "GameSession" (
      "id" TEXT PRIMARY KEY,
      "currentRound" INT NOT NULL DEFAULT 1,
      "totalRounds" INT NOT NULL DEFAULT 20,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now());
    CREATE TABLE "GameParticipant" (
      "id" TEXT PRIMARY KEY,
      "sessionId" TEXT NOT NULL REFERENCES "GameSession"("id"),
      "role" "BeerGameRole" NOT NULL);
    CREATE TABLE "GameRoundState" (
      "id" TEXT PRIMARY KEY,
      "sessionId" TEXT NOT NULL REFERENCES "GameSession"("id"),
      "participantId" TEXT NULL REFERENCES "GameParticipant"("id"),
      "role" "BeerGameRole" NOT NULL,
      "round" INT NOT NULL,
      "cost" DOUBLE PRECISION NOT NULL);
    CREATE UNIQUE INDEX "GameRoundState_sessionId_role_round_key"
      ON "GameRoundState"("sessionId","role","round");
    CREATE TABLE "PendingOrder" (
      "id" TEXT PRIMARY KEY,
      "sessionId" TEXT NOT NULL REFERENCES "GameSession"("id"),
      "participantId" TEXT NOT NULL REFERENCES "GameParticipant"("id"),
      "round" INT NOT NULL,
      "amount" INT NOT NULL);
  `);

  // Session A — joined but never played. This is what every session on the
  // shared database currently looks like, and it must come out team-less.
  await client.query(`INSERT INTO "GameSession"("id","currentRound") VALUES ('sA', 1)`);
  await client.query(
    `INSERT INTO "GameParticipant" VALUES ('pA1','sA','RETAILER'),('pA2','sA','FACTORY')`,
  );

  // Session B — two humans, two roles nobody held, one staged order, costs
  // totalling 25 across two rounds.
  await client.query(`INSERT INTO "GameSession"("id","currentRound") VALUES ('sB', 3)`);
  await client.query(
    `INSERT INTO "GameParticipant" VALUES ('pB1','sB','RETAILER'),('pB2','sB','WHOLESALER')`,
  );
  await client.query(`INSERT INTO "GameRoundState" VALUES
      ('r1','sB','pB1','RETAILER',1,10.5), ('r2','sB','pB2','WHOLESALER',1,4.0),
      ('r3','sB',NULL,'DISTRIBUTOR',1,2.5), ('r4','sB',NULL,'FACTORY',1,3.0),
      ('r5','sB','pB1','RETAILER',2,5.0)`);
  await client.query(`INSERT INTO "PendingOrder" VALUES ('o1','sB','pB1',3,7)`);

  // --- run it, then run it again (the script claims re-runnability) ----------
  await client.query(migration);
  const afterFirst = (await client.query(`SELECT count(*)::int n FROM "BeerTeam"`)).rows[0].n;
  await client.query(migration);

  const one = async (sql) => (await client.query(sql)).rows[0];

  const teams = (
    await client.query(
      `SELECT "sessionId","currentRound","totalCost" FROM "BeerTeam" ORDER BY "sessionId"`,
    )
  ).rows;
  check("session with history gets exactly one team", teams.length === 1 && teams[0]?.sessionId === "sB", JSON.stringify(teams));
  check("session with no history gets no team", !teams.some((t) => t.sessionId === "sA"));
  check("second run changes nothing", afterFirst === teams.length, `first=${afterFirst} second=${teams.length}`);
  check("team inherits the session's currentRound", teams[0]?.currentRound === 3);
  check("totalCost rebuilt from history", Number(teams[0]?.totalCost) === 25, `expected 25, got ${teams[0]?.totalCost}`);

  const slots = (
    await client.query(`SELECT "role","participantId","isRobot" FROM "BeerTeamSlot" ORDER BY "role"`)
  ).rows;
  check("migrated team has four slots", slots.length === 4, `got ${slots.length}`);
  check(
    "humans mapped from the old role values",
    slots
      .filter((s) => !s.isRobot)
      .map((s) => `${s.role}:${s.participantId}`)
      .sort()
      .join(",") === "RETAILER:pB1,WHOLESALER:pB2",
    JSON.stringify(slots.filter((s) => !s.isRobot)),
  );
  check("roles nobody held became robots", slots.filter((s) => s.isRobot).length === 2);

  const orphans = await one(`SELECT
      (SELECT count(*) FROM "GameRoundState" WHERE "teamId" IS NULL)::int rs,
      (SELECT count(*) FROM "PendingOrder"   WHERE "teamId" IS NULL)::int po`);
  check("all history re-pointed at a team", orphans.rs === 0 && orphans.po === 0, JSON.stringify(orphans));

  const robots = await one(`SELECT count(*)::int n FROM "GameRoundState" WHERE "wasRobot"`);
  check("participant-less rounds marked wasRobot", robots.n === 2, `got ${robots.n}`);

  const col = async (table, name) =>
    (
      await one(`SELECT count(*)::int n FROM information_schema.columns
        WHERE table_schema='${SCHEMA}' AND table_name='${table}' AND column_name='${name}'`)
    ).n;
  check("GameParticipant.role retired", (await col("GameParticipant", "role")) === 0);
  check("GameParticipant.joinedAt added", (await col("GameParticipant", "joinedAt")) === 1);
  check("GameRoundState.wasRobot added", (await col("GameRoundState", "wasRobot")) === 1);

  const indexes = (
    await client.query(`SELECT indexname FROM pg_indexes WHERE schemaname='${SCHEMA}'`)
  ).rows.map((r) => r.indexname);
  check("uniqueness re-scoped to (team, role, round)", indexes.includes("GameRoundState_teamId_role_round_key"));
  check("old (session, role, round) unique index dropped", !indexes.includes("GameRoundState_sessionId_role_round_key"));

  const notNull = await one(`SELECT bool_and(attnotnull) ok FROM pg_attribute
      WHERE attrelid='"${SCHEMA}"."GameRoundState"'::regclass AND attname='teamId'`);
  check("GameRoundState.teamId is NOT NULL", notNull.ok === true);

  const dflt = await one(`SELECT column_default d FROM information_schema.columns
      WHERE table_schema='${SCHEMA}' AND table_name='GameSession' AND column_name='totalRounds'`);
  check("totalRounds default is now 40", String(dflt.d) === "40", String(dflt.d));
} finally {
  await client.query("ROLLBACK");
  const left = await client.query(
    `SELECT count(*)::int n FROM information_schema.schemata WHERE schema_name=$1`,
    [SCHEMA],
  );
  console.log(`\nrolled back; scratch schema still present: ${left.rows[0].n === 1}`);
  await client.end();
}

const failed = results.filter((r) => !r.pass);
console.log(
  failed.length
    ? `RESULT: ${failed.length} of ${results.length} assertions FAILED`
    : `RESULT: all ${results.length} assertions passed`,
);
process.exit(failed.length ? 1 : 0);
