# Notices and attribution

## The Beer Game

Bruce's Beer Game is an adaptation of **[The Beer Game](https://github.com/siemsene/beergame)**
by GitHub user **siemsene**, used under
**[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)**. **Modified.**

The underlying simulation is the classic MIT Sloan beer game, devised by Jay
Forrester and popularised by John Sterman. Upstream's own README credits
Forrester; the original physical game set is sold by the
[System Dynamics Society](https://systemdynamics.org/product/supply-chain-game-the-beer-game-complete-game-set/).

We credit the GitHub handle and link the repository rather than naming an
individual: upstream states no author name in any file, and we are not going to
infer someone's real identity from a username.

### What was taken from upstream

| Bruce | Upstream |
|---|---|
| Beer-GPT robot rule (`robotOrder` in `src/lib/beerGame.ts`) | `src/logic/robotOrders.ts` |
| Optional extra order delay, upstream-backlog visibility (`src/lib/beerGameConfig.ts`, engine branch in `src/lib/beerGame.ts`) | `src/logic/gameModel.ts`, `src/logic/gameEngine.ts` |
| Bullwhip ratio, population variance / std dev, leaderboard and std-dev row builders (`src/lib/beerGameAnalytics.ts`) | `src/logic/endgameAnalytics.ts` |
| Cohort drawing, robo-fill, late-join-replaces-robot, team name pool (`src/lib/beerGameTeams.ts`) | `src/logic/teamNames.ts` and `HostLobby.tsx` behaviour |
| CSV escaping and spreadsheet formula-injection hardening (`src/lib/beerGameCsv.ts`); the set of exported files (`src/lib/beerGameExports.ts`) | `src/utils/sessionCsvExport.ts` |
| Dense one-row-per-team host monitoring table, kick-to-robot, end-game-early (`BeerGameHostConsole.tsx`) | `src/components/HostLobby.tsx` |
| Order input guards: negative becomes 0, large order confirms (`OrderForm.tsx`) | `src/components/PlayerView.tsx` |
| Grouped std-dev-by-role bar chart (`src/components/GroupedBarChart.tsx`) | `src/components/charts/TeamRoleStdDevGroupedBarChart.tsx` |

### What was changed

- **Rebuilt on a different stack.** Upstream is React + Vite on Firebase
  (Firestore, Cloud Functions, anonymous auth). Bruce is Next.js 16 + Prisma on
  Postgres/Supabase. No upstream code was copied verbatim; the logic was
  reimplemented against Bruce's schema and server actions.
- **Authentication and roles are Bruce's.** Students sign in with their existing
  account, so sessions link to course rosters. Upstream's instructor-approval
  workflow, `'Sesame'` host password, anonymous sign-in, session tokens and
  heartbeats are all absent — Bruce already has `Profile.role` and an admin area.
- **Fixed an off-by-one in the demand curve.** Upstream's `simulateWeek` indexes
  `config.customerDemand[week]` with a 1-based `week`, skipping index 0 and
  reading one element past the intended position. Bruce's `customerDemand(round,
  config)` steps on the configured round.

  Everything *else* about the simulation is verified identical to upstream:
  `src/lib/beerGameParity.test.ts` replays 40 rounds against a fixture generated
  by running upstream's own `simulateWeek`, and asserts Bruce matches it on
  incoming order, units shipped, closing inventory, backlog and cost for all
  four roles. The fixture uses flat customer demand precisely so the off-by-one
  above is unobservable and the pipeline mechanics are compared in isolation.
  Regenerate with `node scripts/generate-parity-fixture.mts <upstream-clone>`.
- **Robot orders are seeded, not freshly random.** Jitter derives from
  `(teamId, round, role)`, so a round resolves identically if two players race
  to trigger it, and a finished session is replayable.
- **Numbers are exempt from the CSV formula guard.** Upstream prefixes every
  cell starting with `-`; that turns a legitimate `-5` into the text `'-5`.
  Bruce hardens strings only.
- **Chart y-axis is a floor, not a fixed cap.** Upstream pins the order chart to
  25. Bruce treats 25 as a minimum so charts stay comparable, but a genuine
  spike above it still renders instead of being clipped flat.
- **Exports are separate CSVs, not a ZIP,** and the PDF is the browser's own
  print-to-PDF against a print stylesheet — avoiding `fflate`, `jspdf` and
  `html2canvas` as dependencies.
- **Teams advance independently.** Each `BeerTeam` carries its own
  `currentRound`, so one slow chain cannot stall a lecture hall.

### Upstream states two different licenses

This is worth recording plainly, because it is unresolved upstream:

| Where | License | Attribution required | Share-alike required |
|---|---|---|---|
| `LICENSE.md` | CC0 1.0 Universal | No | No |
| `README.md` | CC BY-SA 4.0 | Yes | Yes |

CC0 would let this code be absorbed with no obligations at all; CC BY-SA 4.0
requires that adaptations carry the same license. **We have chosen to honour the
more restrictive reading (CC BY-SA 4.0)** rather than rely on the more permissive
one. If upstream clarifies that CC0 was intended, this can be revisited.

### Scope of the CC BY-SA 4.0 license in this repository

Share-alike attaches to the adaptation, not to unrelated work in the same
repository. **Only the Beer Game files below are CC BY-SA 4.0.** They carry an
`SPDX-License-Identifier: CC-BY-SA-4.0` header. Full license text:
[`LICENSE-CC-BY-SA-4.0.txt`](./LICENSE-CC-BY-SA-4.0.txt).

Covered:

- `src/lib/beerGame.ts`, `beerGameConfig.ts`, `beerGameTeams.ts`,
  `beerGameAnalytics.ts`, `beerGameCsv.ts`, `beerGameExports.ts`, `games.ts`
- the matching `*.test.ts` files
- `src/app/games/[slug]/actions.ts`, `src/app/games/[slug]/BeerGameLanding.tsx`
- `src/app/games/[slug]/sessions/[sessionId]/actions.ts` and every
  `BeerGame*.tsx` / `OrderForm.tsx` view in that directory
- `src/app/games/[slug]/sessions/[sessionId]/export/[kind]/route.ts`
- `src/components/GroupedBarChart.tsx`
- `prisma/sql/beer-game-cohorts.sql`
- `scripts/generate-parity-fixture.mts` and
  `src/lib/__fixtures__/siemsene-engine-golden.json` — the fixture is upstream's
  own engine output, so it is upstream-derived by construction

Not covered — no part of these derives from upstream:

- the AI tutors, Maizey integration, topics, courses and admin areas
- the Newsvendor, Fish Banks, Forecasting, Dice, Random Babies, Prisoner's
  Dilemma and Optimal Stopping games
- `src/components/LineChart.tsx` and `BarChart.tsx` (shared across games; the
  `minAxisMax` prop is Bruce's own code)
- `prisma/schema.prisma` (shared; the `BeerTeam` / `BeerTeamSlot` models are
  original work)
- `src/app/games/[slug]/sessions/[sessionId]/page.tsx`,
  `src/components/PollingRefresher.tsx`, `prisma/seed.mjs`, build and test config

The repository has no repository-wide `LICENSE` file, so everything outside the
covered list remains all rights reserved.

### A note for future maintainers

CC BY-SA 4.0 is not designed for software — Creative Commons
[advises against it for code](https://creativecommons.org/faq/#can-i-apply-a-creative-commons-license-to-software),
as it lacks patent and warranty provisions — and it is only *one-way* compatible
with GPLv3. If a future dependency or contribution requires a different copyleft
license, it may conflict with the files listed above.

## Other credits

- Next.js, React, Prisma, Tailwind CSS and Supabase are used under their
  respective licenses; see `package.json` and each project's repository.
