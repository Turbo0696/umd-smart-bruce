This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Attribution & license

The Beer Game in this project is an adaptation of
[The Beer Game](https://github.com/siemsene/beergame) by GitHub user **siemsene**,
used under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) and
modified. The Beer Game source files are therefore licensed CC BY-SA 4.0 (they
carry an `SPDX-License-Identifier` header); the rest of this repository is not.

See **[NOTICE.md](./NOTICE.md)** for what was taken, what was changed, exactly
which files the license covers, and a note on the two conflicting licenses
upstream states. Full license text: [`LICENSE-CC-BY-SA-4.0.txt`](./LICENSE-CC-BY-SA-4.0.txt).

## Tests

```bash
npm test        # Vitest, unit tests for the Beer Game and Sourcing Negotiation logic — no database needed
npm run test:watch
```

`src/lib/negotiation.test.ts` and `negotiationBot.test.ts` cover the Sourcing
Negotiation engine — the profit math, the two-echelon lot-sizing solver, the
centralized-optimum benchmark, and the scripted bot's negotiation policy.

`src/lib/beerGameParity.test.ts` checks the simulation against a fixture
generated from siemsene/beergame's own engine. To regenerate that fixture:

```bash
git clone --depth 1 https://github.com/siemsene/beergame.git /tmp/beergame
node scripts/generate-parity-fixture.mts /tmp/beergame
```

### Rehearsing the Beer Game database migration

`prisma/sql/beer-game-cohorts.sql` is DDL against a live database — it retires
`GameParticipant.role` and makes two columns `NOT NULL` — so it comes with a
rehearsal harness:

```bash
node scripts/verify-cohort-migration.mjs
```

It builds a pre-cohort replica of the four Beer Game tables in a scratch schema,
seeds the two cases that matter (a session with gameplay history, and an
untouched `PENDING` session), runs the migration against it twice, asserts 17
outcomes, and rolls the whole thing back. `search_path` excludes `public`, so
your own tables are neither read nor written. Needs `DIRECT_URL` in `.env`;
exits non-zero if anything fails.

### Rehearsing the Sourcing Negotiation session lifecycle

The seat-management guards, the atomic session-start transaction, the RFQ
stage-gating, and the `roundMinutes` overflow guard are all either
DB-resident or JSX-resident — none of it is reachable by `npm test`. So it
has its own rehearsal harness that exercises the real server actions against
a live database:

```bash
node --experimental-strip-types scripts/verify-negotiation-session.mjs
```

It plays a full session through to settlement and cross-checks the recorded
profit against an independent recomputation from the engine, confirms
`kickToBot` rejects a dyad from another session and a settled dyad, races two
concurrent `startSession`/`claimBotSeat` calls to confirm they don't
double-create or double-seat, and checks an absurd `roundMinutes` value
doesn't wedge a session. Every row it creates is deleted afterward regardless
of outcome. Needs `DIRECT_URL` or `DATABASE_URL` in `.env` and the
`negotiation-game` `Game` row seeded (`node prisma/seed.mjs`); exits non-zero
if anything fails.

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
