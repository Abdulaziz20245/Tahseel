# Tahseel · تحصيل — concept prototype

Tahseel is a proposed Saudi **government invoice settlement service**. Companies are often owed money and owe money at the same time, yet every B2B invoice is paid on its own, so firms borrow to pay suppliers before their own customers pay them. Tahseel keeps a live network of who owes whom (fed by Fatoora e-invoices) and settles it through a **government hub**: in each settlement round, every company only pays in, or receives, its **net** amount. Debts that cancel out never move as cash.

This repository is the interactive prototype built for the **VentureX hackathon (AI & Data track)**. **All data is synthetic**: company names are real Saudi firms, but every invoice, amount, date and identifier is invented.

> Evidence shows slow collection is costly; it does not yet prove that the lack of netting causes it. That link is a hypothesis, and every number here is what the model computes for synthetic data, not measured real-world impact.

## What you can do in the app

A timeline of 8 scripted events drives everything (**Next event / Back / Reset**, or jump from the dropdown). After each event the settlement plan is re-optimised live in your browser.

| Tab | What it shows |
|---|---|
| **Network** | The who-owes-whom graph of 12 companies and the hub. *Before*: every invoice paid one by one. *After*: only net transfers through the hub, per settlement round. Counters compare payments and cash moved. Click a company or an arrow for details. |
| **Companies** | One company's own view: owed / owing, net position, what it pays the hub or receives, how much was cleared by set-off, each invoice's settlement, its schedule, constraints and proposal status. Hub transfers never reveal the other side (privacy). |
| **Government** | Before vs after for policy makers: payments, cash moved, share settled by set-off, share of the theoretical maximum, overdue and escalated invoices, peak financing need and financing cost (illustrative: 8% rate, zero starting cash). Worse results are shown as worse. |
| **Algorithm** | The model in plain English, the real solver statistics, 7 validator checks, a round-by-round replay and the exact LP model text sent to the solver. |
| **Ask Tahseel AI** | A Gemini-powered assistant that answers questions about the current step, from the government view or one company's view (company views only see that company's data). |

The scripted story: a new invoice closes a debt cycle, a payer asks for 10 more days, one invoice is paid outside Tahseel, another is disputed and put on hold, everyone confirms, the first round executes (partial set-off), the date moves past 60 days so the disputed invoice is escalated, and a new invoice arrives.

## How the optimiser works

For each open invoice it decides **how much settles in which weekly round** (rounds fall on the current date and every 7 days from 3 Oct 2026). An invoice may be split across rounds and never settles after its due date or more than 60 days after issue. Each company makes at most one transfer per round (pay in *or* receive), and the hub pays out exactly what it receives that day.

It is a **mixed-integer linear program** solved by **[HiGHS](https://highs.dev)** (open source, compiled to WebAssembly and run in a Web Worker). Goals are solved in strict priority, each pass locking in the previous optimum:

1. break as few constraints (weekly caps, time limits) as possible;
2. make the fewest payments;
3. move the least cash.

Each pass is **proven optimal** to the halala (SAR 0.01). Redundant valid constraints (e.g. "a net payer pays at least once") keep each pass to about 1–2 seconds. Afterwards, rounds are moved as late as their invoices allow so nobody pays earlier than needed, without changing payments or cash. An independent validator then re-checks 7 rules on every plan. If WebAssembly cannot load, a greedy fallback is used and labelled "optimality not proven".

On the starting data: **35 payments and SAR 34.9m become 14 payments and SAR 15.5m** (100% of the theoretical maximum set-off).

## Running it locally

Requirements: Node.js 20+ and npm.

```bash
npm install          # also copies the HiGHS .wasm into public/solver/
npm run dev          # http://localhost:3000
```

Optional, for the AI assistant: create `.env.local` (see `.env.local.example`):

```
GEMINI_API_KEY=your-key
GEMINI_MODEL=gemini-3.5-flash-lite
```

Without a key the assistant says "unavailable" and everything else works.

> On Windows PowerShell, if `npm` is blocked by the script policy, use `npm.cmd run dev` or run once: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.

### Other scripts

| Command | Purpose |
|---|---|
| `npm test` | Vitest: ledger, optimiser, metrics, allocation, graph and data tests |
| `npm run lint` / `npm run build` | ESLint / production build (build validates the data first) |
| `npm run validate` | Check `data/*.json` against every data rule |
| `npm run describe-data` | Print the scenario's structure (cycles, chains, due-date spread) |
| `npm run check-story` | Replay all steps with the real solver and print what each event does |

## Project structure

```
app/                  Next.js App Router pages (network, companies, government, algorithm)
  api/assistant/      the only server code: the Gemini call (API key stays on the server)
components/           UI components (graph, cards, tables, assistant panel)
lib/
  ledger.ts           applies the scripted events to the invoice ledger
  optimizer/          windows, LP builder, HiGHS passes, validator, heuristic, Web Worker
  metrics.ts          every before/after metric (single source for all tabs)
  allocation.ts       a company's per-invoice split (set-off vs hub)
  graphModel.ts       ledger + plan → graph nodes and edges
  snapshot.ts         compact scenario data sent to the assistant
data/                 synthetic scenario (companies, invoices, constraints, events, settings)
tests/                Vitest tests
Claude.md             full specification and decisions
```

## Tech stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · React Flow (`@xyflow/react`) · HiGHS (`highs`, WebAssembly) · Zod · Google Gemini (`@google/genai`) · Vitest. No database and no login: data is bundled JSON and all state lives in memory (refreshing the page resets the scenario).
