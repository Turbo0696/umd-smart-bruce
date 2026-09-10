-- Beer Game: single-team sessions -> cohort sessions (many teams per join code)
--
-- WHEN YOU NEED THIS
--   Run this on ANY database that already has this app's schema, before pulling
--   the cohort code. It brings the schema fully in line with
--   prisma/schema.prisma, so `npx prisma db push` afterwards reports no
--   changes. Only a database with no schema at all can skip it and use
--   `db push` alone.
--
-- WHY IT EXISTS
--   This repo has no prisma/migrations history (it is managed with `db push`),
--   and `db push` cannot perform this change on a populated database:
--     * "GameRoundState"."teamId" and "PendingOrder"."teamId" are NOT NULL with
--       no default, so they cannot be added to non-empty tables, and
--     * "GameParticipant"."role" is dropped, but its values are the only source
--       for reconstructing who played which role.
--   So the data has to move to the new shape first, which `db push` will not do.
--
-- WHAT IT DOES
--   Structure first: creates BeerTeam / BeerTeamSlot, adds the new columns,
--   re-scopes uniqueness from (session, role, round) to (team, role, round),
--   and retires GameParticipant.role.
--
--   Then data, but only where there is data to move. A session that already
--   holds gameplay history was exactly one 4-role supply chain, so it gets one
--   BeerTeam whose four slots are rebuilt from the old GameParticipant.role
--   values (roles nobody held become Beer-GPT robots), with its history and
--   staged orders re-pointed at that team.
--
--   A session with no history yet — typically PENDING, waiting for players — is
--   deliberately left with NO team. Under the cohort model the host draws the
--   teams when they start the session (see startSession in
--   src/app/games/[slug]/sessions/[sessionId]/actions.ts), and inventing an
--   all-robot "Original Chain" for it here would leave that session looking
--   already-started, with a stray bot-only chain in the host console and the
--   endgame report.
--
-- SAFETY
--   Wrapped in a single transaction and written to be re-runnable: re-running
--   after success makes no further changes. Take a backup first anyway.
--
-- USAGE
--   psql "$DIRECT_URL" -f prisma/sql/beer-game-cohorts.sql
--   (DIRECT_URL, not DATABASE_URL — the transaction pooler does not suit DDL.)
--
--   Then confirm nothing is left over:
--     npx prisma migrate diff --from-config-datasource \
--       --to-schema prisma/schema.prisma
--   which should print "No difference detected".

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. New tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "BeerTeam" (
    "id"           TEXT             NOT NULL,
    "sessionId"    TEXT             NOT NULL,
    "name"         TEXT             NOT NULL,
    "currentRound" INTEGER          NOT NULL DEFAULT 1,
    "totalCost"    DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt"    TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BeerTeam_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "BeerTeamSlot" (
    "id"            TEXT           NOT NULL,
    "teamId"        TEXT           NOT NULL,
    "role"          "BeerGameRole" NOT NULL,
    "participantId" TEXT,
    "isRobot"       BOOLEAN        NOT NULL DEFAULT true,
    CONSTRAINT "BeerTeamSlot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BeerTeam_sessionId_name_key"
    ON "BeerTeam" ("sessionId", "name");
CREATE UNIQUE INDEX IF NOT EXISTS "BeerTeamSlot_teamId_role_key"
    ON "BeerTeamSlot" ("teamId", "role");
CREATE UNIQUE INDEX IF NOT EXISTS "BeerTeamSlot_participantId_key"
    ON "BeerTeamSlot" ("participantId");

-- ---------------------------------------------------------------------------
-- 2. New columns, added nullable so the backfill can populate them
-- ---------------------------------------------------------------------------

ALTER TABLE "GameRoundState"  ADD COLUMN IF NOT EXISTS "teamId"   TEXT;
ALTER TABLE "GameRoundState"  ADD COLUMN IF NOT EXISTS "wasRobot" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PendingOrder"    ADD COLUMN IF NOT EXISTS "teamId"   TEXT;
ALTER TABLE "GameParticipant" ADD COLUMN IF NOT EXISTS "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ---------------------------------------------------------------------------
-- 3. Backfill: one team per existing session
-- ---------------------------------------------------------------------------

-- Every GameSession row is a Beer Game session (newsvendor, fish-banks and
-- forecasting each have their own *Session tables), so no filter on game slug.
--
-- Only sessions that actually hold gameplay history get a team. A session with
-- no history has nothing to preserve and must stay team-less so the host's
-- startSession draws its cohort from the roster — see WHAT IT DOES above.
-- Both statements below read GameParticipant."role", which step 5 retires.
-- Postgres parses a plain statement when it executes it, so on a second run
-- they would fail with 'column p.role does not exist' — the script would not
-- be re-runnable. Guarding on the column and going through EXECUTE means that
-- once the migration has been done, this whole block is skipped instead.
DO $mig$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name   = 'GameParticipant'
          AND column_name  = 'role'
    ) THEN
        RAISE NOTICE
            'GameParticipant.role is already retired - cohort backfill has already run, skipping it.';
        RETURN;
    END IF;

    EXECUTE $sql$
        INSERT INTO "BeerTeam" ("id", "sessionId", "name", "currentRound", "totalCost", "createdAt")
        SELECT
            gen_random_uuid()::text,
            s."id",
            'Original Chain',
            s."currentRound",
            0,
            s."createdAt"
        FROM "GameSession" s
        WHERE NOT EXISTS (SELECT 1 FROM "BeerTeam" t WHERE t."sessionId" = s."id")
          AND (
                EXISTS (SELECT 1 FROM "GameRoundState" rs WHERE rs."sessionId" = s."id")
             OR EXISTS (SELECT 1 FROM "PendingOrder"   po WHERE po."sessionId" = s."id")
          )
    $sql$;

    -- Four slots per team. A role that had a participant becomes that human;
    -- a role nobody held becomes a robot, which matches the old engine's
    -- treatment of an absent role as auto-played.
    EXECUTE $sql$
        INSERT INTO "BeerTeamSlot" ("id", "teamId", "role", "participantId", "isRobot")
        SELECT
            gen_random_uuid()::text,
            t."id",
            r."role",
            p."id",
            (p."id" IS NULL)
        FROM "BeerTeam" t
        CROSS JOIN (
            SELECT unnest(ARRAY['RETAILER', 'WHOLESALER', 'DISTRIBUTOR', 'FACTORY']::"BeerGameRole"[]) AS "role"
        ) r
        LEFT JOIN "GameParticipant" p
               ON p."sessionId" = t."sessionId"
              AND p."role"      = r."role"
        WHERE NOT EXISTS (
            SELECT 1 FROM "BeerTeamSlot" sl
            WHERE sl."teamId" = t."id" AND sl."role" = r."role"
        )
    $sql$;
END $mig$;

-- Point history and staged orders at the session's single team.
UPDATE "GameRoundState" rs
SET "teamId" = t."id"
FROM "BeerTeam" t
WHERE t."sessionId" = rs."sessionId" AND rs."teamId" IS NULL;

UPDATE "PendingOrder" po
SET "teamId" = t."id"
FROM "BeerTeam" t
WHERE t."sessionId" = po."sessionId" AND po."teamId" IS NULL;

-- Rebuild each team's running cost from its resolved history, so the endgame
-- leaderboard ranks migrated sessions correctly instead of showing 0.
UPDATE "BeerTeam" t
SET "totalCost" = COALESCE(agg."sum", 0)
FROM (
    SELECT "teamId", SUM("cost") AS "sum"
    FROM "GameRoundState"
    WHERE "teamId" IS NOT NULL
    GROUP BY "teamId"
) agg
WHERE agg."teamId" = t."id";

-- Mark historical robot rounds so the report can still count them. A round
-- state with no participant was played by a bot under the old engine.
UPDATE "GameRoundState"
SET "wasRobot" = true
WHERE "participantId" IS NULL AND "wasRobot" = false;

-- ---------------------------------------------------------------------------
-- 4. Enforce the new shape
-- ---------------------------------------------------------------------------

-- Guard: refuse to tighten the columns if anything failed to backfill, rather
-- than erroring out halfway with a confusing constraint violation.
DO $$
DECLARE orphan_rounds INT; orphan_orders INT;
BEGIN
    SELECT count(*) INTO orphan_rounds FROM "GameRoundState" WHERE "teamId" IS NULL;
    SELECT count(*) INTO orphan_orders FROM "PendingOrder"   WHERE "teamId" IS NULL;
    IF orphan_rounds > 0 OR orphan_orders > 0 THEN
        RAISE EXCEPTION
            'Backfill incomplete: % GameRoundState and % PendingOrder rows still have a NULL teamId. Rolling back.',
            orphan_rounds, orphan_orders;
    END IF;
END $$;

ALTER TABLE "GameRoundState" ALTER COLUMN "teamId" SET NOT NULL;
ALTER TABLE "PendingOrder"   ALTER COLUMN "teamId" SET NOT NULL;

-- Foreign keys and the re-scoped uniqueness constraint.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BeerTeam_sessionId_fkey') THEN
        ALTER TABLE "BeerTeam" ADD CONSTRAINT "BeerTeam_sessionId_fkey"
            FOREIGN KEY ("sessionId") REFERENCES "GameSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BeerTeamSlot_teamId_fkey') THEN
        ALTER TABLE "BeerTeamSlot" ADD CONSTRAINT "BeerTeamSlot_teamId_fkey"
            FOREIGN KEY ("teamId") REFERENCES "BeerTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BeerTeamSlot_participantId_fkey') THEN
        ALTER TABLE "BeerTeamSlot" ADD CONSTRAINT "BeerTeamSlot_participantId_fkey"
            FOREIGN KEY ("participantId") REFERENCES "GameParticipant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'GameRoundState_teamId_fkey') THEN
        ALTER TABLE "GameRoundState" ADD CONSTRAINT "GameRoundState_teamId_fkey"
            FOREIGN KEY ("teamId") REFERENCES "BeerTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PendingOrder_teamId_fkey') THEN
        ALTER TABLE "PendingOrder" ADD CONSTRAINT "PendingOrder_teamId_fkey"
            FOREIGN KEY ("teamId") REFERENCES "BeerTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- Uniqueness moves from (session, role, round) to (team, role, round): every
-- team in a cohort has its own RETAILER row for round 1.
DROP INDEX IF EXISTS "GameRoundState_sessionId_role_round_key";
CREATE UNIQUE INDEX IF NOT EXISTS "GameRoundState_teamId_role_round_key"
    ON "GameRoundState" ("teamId", "role", "round");
CREATE INDEX IF NOT EXISTS "GameRoundState_sessionId_round_idx"
    ON "GameRoundState" ("sessionId", "round");
CREATE INDEX IF NOT EXISTS "PendingOrder_teamId_round_idx"
    ON "PendingOrder" ("teamId", "round");

-- ---------------------------------------------------------------------------
-- 5. Retire the old role column (its values now live on BeerTeamSlot)
-- ---------------------------------------------------------------------------

ALTER TABLE "GameParticipant" DROP COLUMN IF EXISTS "role";

-- Sessions used to default to 20 rounds; the classic game is 40. This only
-- changes the default for new rows, leaving in-flight sessions alone.
ALTER TABLE "GameSession" ALTER COLUMN "totalRounds" SET DEFAULT 40;

COMMIT;

-- ---------------------------------------------------------------------------
-- Post-run sanity checks (run separately; all three should return 0 rows)
-- ---------------------------------------------------------------------------
--   SELECT * FROM "GameRoundState" WHERE "teamId" IS NULL;
--   SELECT s."id" FROM "GameSession" s
--     WHERE (SELECT count(*) FROM "BeerTeam" t WHERE t."sessionId" = s."id") <> 1;
--   SELECT t."id" FROM "BeerTeam" t
--     WHERE (SELECT count(*) FROM "BeerTeamSlot" sl WHERE sl."teamId" = t."id") <> 4;
