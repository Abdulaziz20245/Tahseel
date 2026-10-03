# Claude.md — Tahseel prototype

> Authoritative reference for building the Tahseel hackathon prototype. Give this file to the coding assistant with every prompt from `Prompts.md`.
>
> Labels: **[Confirmed]** = stated by the owner (Abdulaziz) or decided in Tahseel ground truth v0.2. **[Delegated]** = the owner said "you decide" or accepted a recommendation, and it is recorded here. **[Proposed]** = default chosen by the planner and not yet explicitly approved; change it freely. **[Deferred]** = intentionally not built. **[Illustrative]** = a number or assumption used only for demonstration, never a measured fact.

---

## 1. Project definition and confirmed ground truth

### 1.1 Problem [Confirmed, v0.2]
Saudi companies handle each B2B invoice on its own. A company can be owed money and owe money at the same time, so it must find cash, often borrowed, to pay its suppliers before its own customers pay it. Nobody sees the whole network of obligations, so debts that could cancel each other out are each paid in full. The results are temporary borrowing, late payment, court cases and manual accounting work.

Honest line (keep it in the UI copy): evidence shows slow collection is costly. It does not yet prove that the lack of netting causes it. That link is a hypothesis.

### 1.2 Solution [Confirmed, v0.2]
**Tahseel (تحصيل)** is a proposed **government service**. Participation is mandatory, and it is run by an entity the government picks (SAMA, ZATCA and MoF are examples). It keeps a live network of who owes whom, fed by **Fatoora** e-invoices. After every confirmed event, an **optimiser** re-plans settlement. **Every payment goes through a government hub**, and only the remaining amounts (residuals) actually move. Partial set-off is allowed. Each company must **confirm** its part of a proposal. Companies can set **time constraints** ("we pay this invoice in 10 days") and **value caps** ("no more than SAR X this week"). A government **maximum payment period** applies (60 days, an EU example, still to verify). Overdue invoices are **escalated** to the relevant authority (SAMA, MoJ, MoF, courts).

### 1.3 Audience and what the prototype must prove
- **Audience [Confirmed]:** VentureX hackathon judges (AI & Data track). After a short slide explanation, they open a **public link** and explore on their own. **There is no in-app tour [Confirmed]**, so labels and layout must carry the explanation.
- **The prototype must show:** (1) the who-owes-whom network as a graph; (2) a real optimiser re-planning settlement after each event; (3) for each company, incoming and outgoing amounts and how each invoice is settled; (4) for government, a before/after comparison computed from the same data; (5) how the algorithm works; (6) a real AI assistant answering questions about the current scenario.

### 1.4 Approved scope [Confirmed]
Network graph, event timeline driving live re-optimisation, partial set-off, hub paying only remaining amounts, company dashboards, government before/after console, algorithm tab, AI assistant (real Gemini call). Escalation appears as an overdue badge plus one escalated example. Optional extras are in §2.5.

### 1.5 Technical constraints [Confirmed]
- Next.js (App Router), React, Tailwind CSS, TypeScript.
- Data in **JSON files**. **No external database. No authentication**, login, registration or accounts.
- Mostly frontend. The **only** server code is one route handler for the Gemini call, because the API key must not reach the browser.
- It runs locally (`npm run dev`) and is **deployed to Vercel** for the public link [Confirmed].
- Built by **one developer** who is comfortable with this stack [Confirmed]. Deadline: submission Sat 3 Oct 2026, 15:00.

### 1.6 Terminology and units [Confirmed unless marked]
| Term | Meaning in this prototype |
|---|---|
| Company | A Saudi business taking part in Tahseel. A graph node. |
| Invoice | A Fatoora B2B tax invoice from a **seller (payee)** to a **buyer (payer)**. |
| Amount | **SAR, including 15% VAT** [Confirmed]. Stored as whole riyals (see §8). |
| Incoming | Sum of **open** invoice amounts where the company is the seller (owed to it). |
| Outgoing | Sum of **open** invoice amounts where the company is the buyer (it owes). |
| Open invoice | Not fully settled, not on hold, not escalated. |
| Hub | The government settlement account. Payers pay in; receivers are paid out only from funds received. |
| Settlement round | A date on which a group of invoices settles together through the hub. |
| Set-off | The part of an invoice cleared by opposite obligations in the same round, with no cash moving. |
| Transfer (payment) | One bank transfer: a company paying the hub, or the hub paying a company. "Fewer invoices" in the owner's answer means **fewer payments** [Confirmed]. |
| Cash moved | Total SAR paid into the hub (which equals the total paid out). |
| Baseline ("before") | Every open invoice is paid **in full, separately, on its due date**, directly payer → payee [Confirmed]. |
| Maximum period | 60 days from issue date [Confirmed as a v0.2 example; VERIFY for the real service]. |
| Time constraint | Set by the **payer** on one invoice: "pay this invoice not before date X" and/or "not after date Y" [Delegated interpretation of v0.2's "we pay this invoice in 10 days"; see §1.8]. |
| Weekly cap | Set by a company: the most it will pay into the hub per week (7-day buckets from the scenario date). |
| Held invoice | Excluded from optimisation because the two sides disagree (v0.2 check step). |
| Escalated | A held or unsettled invoice past the maximum period, referred to an authority. |

### 1.7 Decisions and rationale
| # | Decision | Status | Why |
|---|---|---|---|
| D1 | Synthetic data uses **real Saudi firm names** with fake invoices, amounts, VAT numbers and IDs. | Confirmed | Owner's choice; judges know the data is synthetic. v0.2 still requires a visible "Synthetic data" label, so one stays in the header. |
| D2 | General economy, **mainly construction**; about 12 companies and 35 open invoices. | Confirmed | Readable graph; construction payment chains are cited in v0.2. |
| D3 | English UI only, Gregorian dates only. | Confirmed | |
| D4 | Judges trigger events from a **ready-made list** and do not edit data. Developers edit JSON. | Confirmed | |
| D5 | Optimiser = **mixed-integer linear program**, solved in the browser by **HiGHS (highs-js, WebAssembly)**. | Delegated | OR-Tools has no JavaScript API (C++, Python, Java, C# only); HiGHS is the open-source solver v0.2 names, MIT-licensed, supports integer variables and runs client-side, so Vercel needs no Python server. |
| D6 | Objective priority: (0) least constraint breaking, (1) **fewest payments**, (2) **least cash moved**. | Confirmed (O2, O3a) | Owner: "less payments, then less cash, then constraints"; constraints are hard and broken only when impossible, minimally and visibly. |
| D7 | Constraints are **hard**. If the data makes them impossible, break as little as possible and flag in red. | Confirmed (O3a) | |
| D8 | Each company sees per invoice how much was cleared by set-off and how much it paid to or received from the hub, **never which company the hub money came from or went to**. Counterparty names are shown on its own invoices. | Confirmed | v0.2 privacy, plus the owner's answer to Q10. |
| D9 | Real LLM: **Google Gemini API** via `@google/genai`, from one Next.js route handler. | Confirmed (O4) | |
| D10 | Hosting on **Vercel**. | Confirmed (O5) | |
| D11 | Government metrics: all proposed (see §6). | Confirmed (O6) | |
| D12 | Graph rendering: **React Flow** (`@xyflow/react`) with node positions fixed in JSON. | Proposed | Stable, readable layout; custom nodes styled with Tailwind. |
| D13 | No chart library; bars are drawn with Tailwind divs. | Proposed | Fewer dependencies; only a few bars are needed. |
| D14 | Tests with **Vitest** for calculations only; data validated with **Zod**. | Proposed | Correctness of numbers is what judges can check. |
| D15 | Assistant runs on a stateless request: client sends the question, the last 6 messages and a compact scenario snapshot. | Proposed | Serverless-friendly; no stored conversation. |
| D16 | **Weekly settlement rounds**: the hub settles on the current date and every 7 days from the base scenario date (3 Oct 2026). Optimality is proven to the halala (`mip_abs_gap: 0.01`); the "later rounds" tie-break is applied after solving. Added in P04. | Confirmed (P04) | The model as first written (one candidate day per distinct date, ≈27) could not be proven optimal within 5 s per pass (66 s for pass 1 at step 0). With the weekly calendar every pass at every step is "Optimal" in about 2 s or less (Node). |
| D17 | E01 is **Nesma → El Seif** (NSM-2026-0412, SAR 805,000) instead of the Alfanar example; ALF-2026-0102 has 60-day terms. | Confirmed (P02, P04) | Alfanar and El Seif are both net receivers, so that invoice would not reduce payments or cash. The 60-day terms let E02's "not before 13 Oct" move the invoice to the 17 Oct round instead of breaking the constraint. |

### 1.8 Remaining uncertainties
- **Time constraint direction.** v0.2 says "we pay this invoice in 10 days". The prototype supports both `notBefore` and `notAfter` on an invoice; the scripted demo event uses `notBefore` (the payer needs time to have cash). [Delegated, easy to change in JSON]
- **60-day maximum** is an EU example (v0.2 [VERIFY]).
- **8% financing rate** is [Illustrative] (v0.2's example).
- **Company HQ cities** shown in data are best-effort and should be checked before the pitch; they are not essential to the demo.
- **Gemini model ID**: docs on 2 Oct 2026 list `gemini-3.5-flash-lite` ("fastest, most cost-effective") and `gemini-3.8-flash`. Use an env var (`GEMINI_MODEL`) so it can be switched without code changes. Re-check the docs when implementing P09.

### 1.9 Deferred
Arabic/RTL UI, Hijri dates, real Fatoora or bank integration, production infrastructure, dispute workflow UI, exception-request workflow, funding model, mobile-first layout, judge data editing, persistence between sessions.

---

## 2. Prototype boundaries

### 2.1 Works for real (computed)
- Applying scripted events to the ledger (add invoice, mark paid, set constraint, set cap, confirm, execute round, advance date).
- The MIP optimiser and the validator, on every change.
- All company totals, invoice allocations and government metrics, derived from the same ledger and plan.
- The AI assistant (a real Gemini call grounded in the current scenario snapshot).

### 2.2 Synthetic
All companies' invoices, amounts, VAT numbers, Fatoora UUIDs, dates, constraints and events. Company **names** are real Saudi firms [D1]; everything about them in the app is invented. The header shows **"Synthetic data"** on every page.

### 2.3 Illustrative (labelled as such in the UI)
- The 8% financing rate and the financing-cost figure built on it.
- The assumption that companies start with zero spare cash when computing financing need (§6).
- The round-by-round replay on the Algorithm tab: it **explains the solver's result**; it is not footage of the solver's internal search.
- "Mock Fatoora feed", "bank match confirmed" and "escalated to MoJ" are simulated events, not real integrations.

### 2.4 Out of scope
See §1.9. Also no fees, no interest and no pricing of payment timing (v0.2: timing is never priced).

### 2.5 Optional (only if all must-haves are done)
- A second scenario selectable from a dropdown.
- A CSV export of a company's settlement statement.

### 2.6 Reaffirmed
Local execution plus Vercel deployment; Next.js + React + Tailwind; JSON data; **no external database; no authentication**. In-memory state only: a page refresh equals Reset. Nothing is ever written back to the JSON files at runtime.

---

## 3. Main user flow and navigation

### 3.1 Layout shell
- **Header:** left "Tahseel · تحصيل" wordmark (text only, no SAMA or ZATCA logos) with the subtitle "Invoice settlement network — concept prototype"; right a grey pill reading **"Synthetic data"**.
- **Tab bar** under the header, as routes: **Network** (`/network`, default; `/` redirects here), **Companies** (`/companies`), **Government** (`/government`), **Algorithm** (`/algorithm`).
- **Timeline strip** (on every tab, directly under the tabs): the current scenario date, "Event k of N", the current event's title, and buttons **Back**, **Next event**, **Reset**. This is the main action and sits in the same place on every tab.
- **Assistant button** fixed bottom-right ("Ask Tahseel AI"), opening a right-side panel on any tab.

### 3.2 Shared state
One `ScenarioProvider` (React context) in the root layout holds `stepIndex` (0 to N; how many scripted events are applied), `selectedCompanyId`, `selectedRoundDate` and the assistant panel state. Everything else is **derived** (see §9.3): the ledger from base data plus events 1..stepIndex, then the plan from the optimiser, then the metrics. Because tabs share the provider, switching tabs keeps the same step and selection.

### 3.3 Demo journey (what a judge does)
1. Lands on **Network**: the graph shows 12 companies and the hub; the counters show *before* vs *after* for payments and cash at step 0.
2. Clicks **Next event**: a toast-free inline "What just happened" card explains the event (for example "Fatoora: new invoice ALF-2026-0412, Alfanar → El Seif, SAR 805,000"). The plan re-solves; changed edges pulse once; counters update; companies whose plan changed get a "Proposal changed — awaiting confirmation" badge.
3. Clicks a company node to see a side card, then "Open dashboard", which goes to **Companies** with that company selected.
4. Opens **Government**: before/after metrics, overdue and escalated list, and round summary, all for the same step.
5. Opens **Algorithm**: the model, the real solver statistics and the round replay.
6. Asks the assistant, for example "Why did Zamil Steel's payment drop?".
7. Continues through the events to the round execution and the escalation; **Reset** returns to step 0 at any time.

### 3.4 Per-view specification

**Network** (purpose: show the network and the effect of each event)
- Components: `GraphCanvas`, `RoundLegend`, `BeforeAfterCounters`, `EventCard`, `NodeDetailCard`.
- Actions: select a node, select an edge (lists that pair's invoices), choose a round chip, toggle **View: Before | After**.
- States: *Solving…* (graph dimmed and spinner in the counters, keeping the previous plan visible); *No open invoices* ("Nothing to settle at this step"); *Plan invalid* (red banner "Validator failed: …", showing the baseline only); *Solver unavailable* (amber banner "Exact solver failed to load — showing heuristic plan").

**Companies** (purpose: one company's view, as that company would see it)
- Components: `CompanySelect` (a dropdown with search; no account switching), `CompanySummaryCards`, `InvoiceTable`, `SettlementSchedule`, `ConstraintList`, `ProposalStatus`.
- Actions: choose a company; sort or filter the invoice table (Incoming / Outgoing / All). No data editing [D4].
- States: none selected (prompt "Choose a company"; defaults to the first company); company with no open invoices ("No open invoices at this step"); invoice on hold ("On hold — sides disagree"); escalated ("Escalated to MoJ on <date>").

**Government** (purpose: aggregate before vs after for policy makers)
- Components: `MetricGrid` (each metric shows before, after, change and direction), `TheoreticalMaxBar`, `RoundsTable`, `OverdueList`, `FinancingPanel` (labelled illustrative).
- Actions: click a round row to set `selectedRoundDate` and jump to Network; click an overdue invoice to jump to the payer's company view.
- States: zero baseline ("—" with the note "no open invoices"); escalations empty ("No escalations at this step").

**Algorithm** (purpose: show what the optimiser does and that it is real)
- Components: `ProblemStatement`, `ModelSummary` (live counts), `PassesTable` (real solver stats), `ValidatorChecks`, `RoundReplay`, `LpModelViewer` (collapsible, shows the generated CPLEX LP text), `WhyHiGHS` (short note).
- Actions: step the replay through rounds (Prev / Next round); expand the LP text; copy the LP text.
- States: solving; fallback heuristic (passes table replaced by "Heuristic plan — optimality not proven").

**Assistant panel**
- Perspective selector: **Government view** (full network) or **a company** (only that company's data; mirrors v0.2 privacy).
- States: idle with 3 suggested questions; loading; answer; error ("Assistant unavailable right now" if the key is missing or a rate limit is hit). The rest of the app never depends on it.

### 3.5 What updates when
Any change to `stepIndex` re-derives the ledger, then re-solves, then all views update. `selectedCompanyId` only changes the Companies tab, the highlighted node and the assistant default perspective. `selectedRoundDate` highlights that round on Network and Algorithm.

---

## 4. Graph simulation specification (core feature)

### 4.1 Nodes
- **Company node**: id (for example `SBG`), short name, sector icon letter, city. Size is fixed; a ring shows the company's **net position** (green = net receiver, navy = net payer, grey = zero). The label shows the short name, and on hover the full name, incoming, outgoing and net.
- **Hub node** (centre): "Tahseel Hub". In After view it shows the selected round's total pay-in.
- Badges on nodes: "Changed" (plan changed at this step, until confirmed), "Escalation" (has an escalated invoice), "Cap" or "Time limit" (has an active constraint).

### 4.2 Edges
- **Before view:** one directed edge per **payer → payee pair** with open invoices, labelled with the pair's total SAR (compact, for example "SAR 1.2m"). Thickness ∝ amount (3 steps: thin, medium, thick using quantiles). This is what the baseline pays: one transfer per invoice (the edge tooltip shows the invoice count).
- **After view:** invoice edges stay faint, coloured by the **round** they settle in (an edge with invoices in several rounds is drawn as a dashed multi-colour edge). Hub edges are drawn solid for the **selected round**: company → hub (pay-in) and hub → company (pay-out), labelled with amounts. Companies that net to zero in that round have no hub edge, which is the visual point.
- Held or escalated invoices: dotted red edges, excluded from rounds.

### 4.3 Legend (always visible, bottom-left of the canvas)
Round colours with dates; solid = hub transfer in the selected round; faint = invoice cleared in that round; dotted red = on hold or escalated; ring colours = net receiver, net payer, zero.

### 4.4 Layout
**Fixed coordinates** stored in `companies.json` (`x`, `y`), arranged on two rings by sector (contractors inner, suppliers outer) with the hub at (0,0). This is a manual layout, not a force simulation, so the graph is the same on every load. React Flow's `fitView` on mount; zoom and pan allowed; nodes **not draggable** (avoids messy screenshots).

### 4.5 Selection and detail
- Click a node: `NodeDetailCard` with incoming, outgoing, net, number of payments before/after, rounds it takes part in, and "Open dashboard".
- Click an edge: the list of invoices for that pair (id, amount, due date, round, status).
- Click empty canvas: clears the selection.

### 4.6 Controls and their exact behaviour
| Control | Behaviour |
|---|---|
| **Next event** | `stepIndex += 1` (disabled at N). Applies the event, re-solves, shows the EventCard. |
| **Back** | `stepIndex -= 1` (disabled at 0). Re-derives from scratch (events are replayed from step 0, never "undone"). |
| **Reset** | `stepIndex = 0`, clears selections. |
| Event list (dropdown on the timeline strip) | Jump to any step k; same as replaying events 1..k. |
| View: Before / After | Switches the edge rendering only. |
| Round chips | Set `selectedRoundDate`; default = earliest round. |

There is no play, pause or speed control: the simulation is **event-stepped**, not time-animated [Proposed; matches the event-driven v0.2 cycle]. One short (≤600 ms) pulse on changed edges is decoration only.

### 4.7 What causes recalculation
Only a change of `stepIndex`. A recalculation is: rebuild the ledger, then build the model, then solve (in a Web Worker), then validate, then compute metrics. Requests are tagged with the step; a result for an old step is discarded (rapid clicking stays correct).

### 4.8 Invalid data
Data is validated at build time (`npm run validate`, also run in `prebuild`). If validation fails at runtime anyway (for example a developer edit while running `dev`), the app shows a full-width error panel listing each problem (file, id, rule) instead of a broken graph.

### 4.9 Three things kept separate
1. **Optimisation algorithm** (MIP in HiGHS): decides the plan. The only source of plan numbers.
2. **Graph layout** (fixed coordinates): decides where nodes sit. No algorithmic meaning.
3. **Animation** (edge pulse, replay highlighting): explains a computed result. Never evidence on its own.

---

## 5. Company dashboards

- **Selection:** `CompanySelect` on the Companies tab, or a click on a graph node, or an overdue row on Government. Default: first company in the JSON.
- **Summary cards** (all derived from the ledger and plan at the current step):
  - **Incoming (owed to us)** = Σ remaining amount of open invoices where seller = company.
  - **Outgoing (we owe)** = Σ remaining amount of open invoices where buyer = company.
  - **Net position** = Incoming − Outgoing (positive = net receiver).
  - **We pay the hub** = Σ over rounds of the company's pay-in. **The hub pays us** = Σ of pay-outs.
  - **Cleared by set-off** = (Incoming + Outgoing − pay-in − pay-out) ÷ 2, shown as SAR and as % of (Incoming + Outgoing) ÷ 2. *(Explanation: every SAR of set-off clears one SAR of incoming and one of outgoing.)*
  - **Payments before → after**: number of invoices the company is party to as payer (before) vs number of rounds in which it pays the hub (after); likewise for receipts.
- **Invoice table** columns: Invoice no., Direction (In/Out), Counterparty (name shown [D8]), Issue date, Due date, Amount (SAR incl. VAT), Round date(s), **Cleared by set-off**, **Paid to hub** or **Received from hub**, Status (Open / Partly settled / Settled / On hold / Escalated / Paid outside Tahseel).
- **Per-invoice allocation rule** (company's own view; computed in `allocation.ts`): for company c and round d, let P = Σ outgoing amounts settled that round and R = Σ incoming. If P > R, c pays the hub P − R, and each outgoing invoice i settled that round gets hub payment xᵢ·(P−R)/P and set-off xᵢ − that. All incoming invoices that round are fully set-off. If R > P, symmetric: the hub pays R − P, split over incoming invoices pro rata; outgoing invoices fully set-off. If P = R, everything is set-off. Rounding: to the halala, with the remainder put on the largest invoice. The seller's and buyer's views of the same invoice may split differently; each is correct for its owner.
- **Settlement schedule:** one row per round: date, pay to hub or receive from hub, invoices covered, confirmation status.
- **Constraints:** a list of the company's active time limits and weekly cap, with the event step that set them.
- **Proposal status:** "Confirmed" or "Changed at event k — awaiting confirmation" (a company is *affected* when its schedule rows differ from the previous step's plan).
- **Before/after**: each summary card shows a small grey "before" value where it differs (for example "Payments: 7 → 2").

---

## 6. Government comparison view

- **For:** the government entity operating Tahseel and policy judges.
- **Baseline** [Confirmed]: the same open invoices at the same step, each paid in full, directly, on its due date (or on the scenario date if already past due).
- **After:** the optimiser's plan at that step.
- All metrics use exactly the same set of open invoices for before and after; held or escalated invoices are excluded from both and counted separately.

| Metric | Formula | Unit | Better |
|---|---|---|---|
| Payments (bank transfers) | Before: number of open invoices. After: Σ round pay-ins + pay-outs (count of non-zero hub legs). | count | lower |
| Cash moved | Before: Σ open amounts. After: Σ hub pay-ins. | SAR | lower |
| Debt settled by set-off | 1 − cash after ÷ cash before. | % | higher |
| Share of theoretical maximum | (cash before − cash after) ÷ (cash before − Σ positive overall net positions). The denominator is the most set-off possible if every invoice could settle on one day. | % | higher (≤100%) |
| Invoices past the 60-day maximum | Count and SAR of open, held or escalated invoices with issue date + 60 < scenario date. | count, SAR | lower |
| Escalated | Count and list (invoice, payer, authority, date). | count | lower |
| Peak financing need | For each company, walk the days from the scenario date: cumulative cash = receipts − payments so far (starting at **0 spare cash** [Illustrative]); need = max shortfall. Sum over companies. Before uses invoice due dates; after uses hub legs on round dates. | SAR | lower |
| Estimated financing cost | Σ over companies and days of shortfall × 8% ÷ 365. Labelled **"Illustrative — assumed 8% rate, zero starting cash"**. | SAR | lower |

- **Change:** absolute = after − before; percent = (after − before) ÷ before. If before = 0, show "—" and "n/a (no baseline)". Never show "∞" or "NaN".
- **Direction:** a green arrow when the change goes in the "better" direction, red when worse, grey when equal. **If the plan is worse on a metric, show it honestly** (for example, payments can rise when hub legs exceed invoice count in a sparse network).
- **Explaining the aggregates:** `RoundsTable` (date, invoices, gross SAR, set-off SAR, hub cash, payments); clicking a row highlights that round on Network.
- Footnote on the page: "Synthetic Saudi scenario. Results show what the model computes for this data, not measured real-world impact."

---

## 7. Algorithm recommendation

### 7.1 Candidates considered
| Option | Fit | Quality | Effort | Verdict |
|---|---|---|---|---|
| Net positions only (each firm pays or receives its overall net once) | Ignores due dates, time limits and caps | Fails constraints | Very low | Rejected: not a real optimisation, and breaks constraints. |
| Cycle cancellation / min-cost flow (OR-Tools `SimpleMinCostFlow`) | Maximises cancelled debt but has no time dimension or payment count | Optimal for cash only | Medium, and no JS OR-Tools | Rejected as the main approach; idea reused in the "theoretical maximum" metric. |
| **MIP over settlement rounds (HiGHS)** | Models time windows, caps, payment counts and cash together | **Proven optimal** for the model | Medium | **Chosen.** |
| Greedy interval-stabbing heuristic | Fewest rounds, then net per round | Good, not optimal for payments | Low | **Fallback only** if WebAssembly fails. |

### 7.2 Inputs and outputs
- **Input:** open invoices (id, payer, payee, remaining amount, issue date, due date, notBefore?, notAfter?), company weekly caps, scenario date, max period.
- **Output:** `Plan` = list of rounds; for each round, the amount of each invoice settled, each company's pay-in or pay-out, payment count; plus `solverStats` per pass, `constraintBreaks`, `validator` results.

### 7.3 Windows and candidate days
For invoice i, with T = scenario date and P = 60 days:
- `latestMax = issue + P`. If `latestMax < T`, the invoice is **overdue**: excluded and escalated (if not already).
- `earliest = max(T, notBefore ?? T)`
- `latest = min(latestMax, notAfter ?? ∞, max(due, T))`
- If `earliest > latest`, the company's constraint cannot be met. Drop `notBefore`/`notAfter` for that invoice (keeping the max period), record a **constraint break** with its reason, and recompute.
- **Candidate days** [amended in P04, D16] D = the **weekly round calendar**: {T} ∪ {base scenario date + 7k ≥ T}, up to the latest `issue + 60`, keeping only days that fall inside some window. An invoice may settle on any round day inside its window, so it is never settled after its due date (it may settle at the last round before it). A time limit counts as impossible when no round day falls inside the constrained window; it is then relaxed as above, dropping as few limits as possible.
- *(Original text: D = {T} ∪ {earliestᵢ} ∪ {latestᵢ}, sorted, because any group of invoices settled together needs a common day inside all their windows and the smallest `latest` in the group is such a day. Replaced because ≈27 candidate days made the MIP unprovable within the time limit.)*

### 7.4 Model (written in CPLEX LP format for highs-js)
Variables:
- `x_i_d ≥ 0`: SAR of invoice i settled on day d (only for d in i's window).
- `in_c_d ≥ 0`, `out_c_d ≥ 0`: company c's pay-in to and pay-out from the hub on day d.
- `yi_c_d`, `yo_c_d ∈ {0,1}`: whether that pay-in or pay-out happens.
- `s_c_w ≥ 0`: amount by which company c exceeds its weekly cap in week w (break slack).

Constraints:
1. **Fully settled:** Σ_d x_i_d = remainingᵢ for every open invoice i.
2. **Company balance per day:** Σ_{i: payee=c} x_i_d − Σ_{i: payer=c} x_i_d = out_c_d − in_c_d.
3. **Link amounts to payments:** in_c_d ≤ M_c · yi_c_d; out_c_d ≤ M_c · yo_c_d; yi_c_d + yo_c_d ≤ 1. M_c = Σ amounts of invoices involving c. *(Implemented with a tighter, equally valid M: the most c could pay, or receive, on day d.)*
4. **Weekly cap:** Σ_{d in week w} in_c_d ≤ cap_c + s_c_w (only for companies with a cap).
5. **Hub never pays out unreceived money:** Σ_c in_c_d = Σ_c out_c_d for each d. (Implied by 2, but kept explicitly and checked by the validator.)
6. **Valid inequalities** [added in P04]: true in every feasible plan, so the optimum is unchanged; they give HiGHS a strong lower bound. A net payer pays the hub at least once; a net receiver is paid at least once; a capped net payer pays in at least ⌈(net payable − allowed slack) ÷ cap⌉ times; Σ pay-ins ≥ Σ net payables.

Objective, solved **lexicographically in three passes** (each pass adds the previous optimum as a constraint, with tolerance 0.01 SAR for the cap slack and 0 for counts) [amended in P04, D16]:
- **Pass 0:** minimise Σ s_c_w (skip if no caps). → least constraint breaking.
- **Pass 1:** minimise Σ (yi + yo). → fewest payments.
- **Pass 2:** minimise Σ in_c_d → least cash.
- **Tie-break towards later rounds (after pass 2, no solver):** each round, latest first, moves as a whole to the latest round day all its invoices allow, merging with any round already there. A move is kept only if payments and cash are unchanged and no weekly cap gets worse, so the proven optima of passes 0–2 are preserved. Payers don't pay earlier than needed; nobody is paid after their due date because windows already end there.
- *(Original: pass 2 minimised Σ in + ε·Σ_d rank(d)·Σ_c in with ε = 1e-6, and the tolerance was 0.5 SAR. The ε term made the proof stall at the halala level, and 0.5 SAR let a cap be exceeded by SAR 0.50 without a recorded break.)*

Options: `{ output_flag: false, time_limit: 5, mip_rel_gap: 0, mip_abs_gap: 0.01 }`: optimal to the halala. HiGHS's default absolute gap of 1e-6 is below floating-point precision on totals of about SAR 15m and never closes.

### 7.5 Pseudocode
```
optimise(ledger):
  open = ledger.invoices where status in {open, partly_settled} and not overdue
  if open is empty: return emptyPlan
  windows, breaks = computeWindows(open, ledger.constraints, roundCalendar)
  days = round days inside some window
  base = buildLp(open, windows, days, caps) + valid inequalities
  r0 = caps ? solve(base + objective(Σs)) : {value: 0}
  r1 = solve(base + "Σs ≤ r0+0.01" + objective(Σy))
  r2 = solve(base + "Σs ≤ r0+0.01" + "Σy ≤ r1" + objective(Σin))
  rounds = extract(r2) with amounts rounded to 0.01 SAR, residual fixed on largest x per invoice
  rounds = shiftRoundsLater(rounds)            # tie-break; payments and cash unchanged
  checks = validate(plan, open, windows, caps)
  return {plan, stats:[r0,r1,r2], breaks, checks}
```

### 7.6 Size, speed and exactness
At about 12 companies, 35 invoices and 10–20 candidate days: at most ~700 continuous `x` variables (fewer in practice, because windows prune days) and about 480 binaries. HiGHS should solve this within a second per pass. This is an estimate; **measure it in P04 and show the real time** on the Algorithm tab. **Measured in P04:** with the original ≈27 candidate days, pass 1 needed 66 s to prove optimality at step 0. With the weekly calendar (D16) the model has about 400 variables (138 binary), and every pass at every step is "Optimal": slowest pass ≈2 s in Node (≈4 s in the browser), ≈12 s for all 9 steps. With `mip_rel_gap: 0`, `mip_abs_gap: 0.01` and status "Optimal", the plan is **proven optimal for this model**. If the time limit is hit, the status and gap are shown and the plan is labelled "best found, not proven optimal".

### 7.7 Edge cases
- No open invoices: empty plan, no solve, metrics show "—".
- Disconnected groups: handled naturally by the same model (they never share a balance constraint). Splitting into independent groups is a v0.2 scaling idea, **not needed** at this size [Deferred].
- Empty window after a constraint: drop the constraint and record a break (§7.3).
- Infeasible after relaxation (should not happen): show the "Plan invalid" state and the baseline.
- WebAssembly fails to load: run `heuristicPlan` (§7.8) and show the amber banner.

### 7.8 Fallback heuristic (`heuristic.ts`)
Sort windows by `latest`; greedily pick the fewest days that hit every window (classic interval stabbing, optimal for **number of rounds**); assign each invoice to the latest picked day inside its window; compute per-round nets. Ignores caps (flags any cap exceeded). Labelled "heuristic — optimality not proven".

### 7.9 Correctness checks (`validate.ts`, run after every solve)
1. Every open invoice: Σ settled = remaining (±0.01 SAR).
2. Every settlement day is inside the invoice's window.
3. Per day: Σ pay-ins = Σ pay-outs (±0.01); no company both pays and receives on one day.
4. Per company per day: pay-out − pay-in = receivable − payable settled that day (±0.01).
5. Each company's overall net position (Σ in − Σ out over the whole plan) equals its ledger net position.
6. Weekly caps respected, or the excess listed as a constraint break.
7. No settlement date later than issue + 60.
Each check shows ✓ or ✗ with a one-line description on the Algorithm tab.

---

## 8. JSON data model and synthetic scenario

### 8.1 Files (`/data`)
- `settings.json`: `{ "scenarioDate": "2026-10-03", "maxPaymentDays": 60, "vatRate": 0.15, "financingRateIllustrative": 0.08, "currency": "SAR" }`
- `companies.json`: `Company[]`
- `invoices.json`: `Invoice[]` (state at step 0)
- `events.json`: `ScenarioEvent[]` (the ready-made list, in order)
- `constraints.json`: `Constraint[]` at step 0 (may be empty)

### 8.2 Types (TypeScript; mirrored in Zod)
```ts
type CompanyId = string;            // 2–5 uppercase letters, unique, e.g. "SBG"
interface Company {
  id: CompanyId;
  name: string;                     // real Saudi firm name [D1]
  shortName: string;                // ≤ 18 chars for node labels
  sector: "Contracting" | "Steel" | "Cement & Concrete" | "Electrical" | "Building Materials" | "Food" | "Retail";
  city: string;                     // best-effort HQ city
  vatNumber: string;                // FAKE: 15 digits, starts and ends with "3"
  crNumber: string;                 // FAKE: 10 digits
  x: number; y: number;             // fixed graph position
}
type InvoiceStatus = "open" | "held" | "paid_outside";   // "settled", "partly_settled" and "escalated" are derived
interface Invoice {
  id: string;                       // e.g. "SBG-2026-0107" (seller prefix)
  fatooraUuid: string;              // fake UUID v4
  sellerId: CompanyId;              // payee
  buyerId: CompanyId;               // payer
  issueDate: string;                // YYYY-MM-DD, Gregorian
  dueDate: string;                  // ≥ issueDate
  amountExVat: number;              // whole SAR, multiple of 100
  vat: number;                      // = amountExVat * 0.15 (integer by construction)
  total: number;                    // = amountExVat + vat
  status: InvoiceStatus;
  holdReason?: string;              // required when status = "held"
  description: string;              // e.g. "Rebar supply, Phase 2"
}
interface Constraint {
  id: string;
  companyId: CompanyId;
  kind: "notBefore" | "notAfter" | "weeklyCap";
  invoiceId?: string;               // required for notBefore/notAfter; payer must be companyId
  date?: string;                    // for notBefore/notAfter
  amount?: number;                  // SAR, for weeklyCap
  note: string;                     // e.g. "We pay this invoice in 10 days"
}
type ScenarioEvent =
  | { id: string; type: "invoice_issued"; title: string; invoice: Invoice }
  | { id: string; type: "payment_marked"; title: string; invoiceId: string; bankMatch: boolean }
  | { id: string; type: "constraint_set"; title: string; constraint: Constraint }
  | { id: string; type: "proposal_confirmed"; title: string; companyIds: CompanyId[] | "all" }
  | { id: string; type: "round_executed"; title: string }        // executes the earliest round of the current plan
  | { id: string; type: "date_advanced"; title: string; newDate: string };
```

Derived (never stored in JSON):
```ts
interface Ledger { date: string; invoices: LedgerInvoice[]; constraints: Constraint[];
                   confirmations: Record<CompanyId, number /*step confirmed*/>;
                   executedRounds: ExecutedRound[]; escalations: Escalation[]; log: string[] }
interface LedgerInvoice extends Invoice { settled: number; remaining: number;
                   derivedStatus: "open"|"partly_settled"|"settled"|"held"|"escalated"|"paid_outside" }
interface Round { date: string; settlements: {invoiceId: string; amount: number}[];
                  legs: {companyId: CompanyId; dir: "in"|"out"; amount: number}[] }
interface Plan { rounds: Round[]; breaks: ConstraintBreak[]; stats: PassStat[];
                 checks: CheckResult[]; method: "mip" | "heuristic" | "none" }
interface Metrics { /* one field per row of §6, each {before, after} */ }
```

### 8.3 Event semantics (fixed code in `ledger.ts`)
- `invoice_issued`: validate it like base data; add it as open. If an id is duplicated, the event fails (shown in EventCard, ledger unchanged).
- `payment_marked`: if `bankMatch` is true, status becomes `paid_outside` (removed from the network). If false, status becomes `held` with reason "Paid mark not matched by bank" (v0.2 rule).
- `constraint_set`: add or replace the constraint with the same company, kind and invoice.
- `proposal_confirmed`: record confirmation at this step. Data unchanged, so the plan is reused, not re-solved.
- `round_executed`: needs every company with a leg in the earliest round to be confirmed **at or after** the step where its plan last changed. If not, the event shows "Blocked — awaiting confirmation from: …" and nothing changes (robust in any order). If yes, add each settlement amount to `settled`, store the round in `executedRounds`, then re-solve the remainder.
- `date_advanced`: set the date; any held or open invoice with issue + 60 < date becomes **escalated** (authority: "MoJ — commercial court referral" for held invoices with a dispute reason, "MoF — payment discipline unit" otherwise [Illustrative routing]).

### 8.4 Companies [Confirmed D1: real names; all data about them synthetic]
| id | Name | Sector | City (verify) |
|---|---|---|---|
| SBG | Saudi Binladin Group | Contracting | Jeddah |
| NSM | Nesma & Partners | Contracting | Al Khobar |
| ESE | El Seif Engineering Contracting | Contracting | Riyadh |
| ZML | Zamil Steel | Steel | Dammam |
| YSI | Al Yamamah Steel Industries | Steel | Riyadh |
| YCC | Yamama Cement | Cement & Concrete | Riyadh |
| SRC | Saudi Readymix Concrete | Cement & Concrete | Al Khobar |
| ALF | Alfanar | Electrical | Riyadh |
| BPT | Al-Babtain Power & Telecom | Electrical | Riyadh |
| SCC | Saudi Ceramics | Building Materials | Riyadh |
| ALM | Almarai | Food | Riyadh |
| PND | Panda Retail Company | Retail | Jeddah |

### 8.5 Rules that make the data plausible
- Flows follow real supply logic: contractors buy from steel, cement/concrete, electrical and ceramics suppliers; suppliers buy services or materials from each other (for example a steel plant's electrical works from Alfanar); contractors build facilities for Almarai and Panda; Panda buys from Almarai; Almarai buys site works from a contractor.
- **35 open invoices** at step 0: amounts SAR 50,000–3,000,000 ex VAT (multiples of 100), heavier for contractor invoices. Issue dates 2026-08-10 to 2026-09-30. Payment terms 30, 45 or 60 days (due = issue + term, never beyond issue + 60).
- Structure required so the optimiser has something to show: **at least two cycles** (lengths 3 and 4), **one chain of 4+** companies, due dates spread so that **at least 3 rounds** are needed, **one held invoice** (issue date 2026-08-10, so the date event can escalate it), **one weekly cap** at step 0 (Nesma, for example SAR 1,500,000 per week) that is binding.
- No self-invoices; seller ≠ buyer; every company has at least one incoming and one outgoing invoice.
- Fake identifiers: VAT `3` + 13 digits + `3`; CR 10 digits; Fatoora UUID v4. **Never real identifiers.**

### 8.6 Scripted events (the story; ids `E01`…)
1. `invoice_issued` **closes a cycle** (for example Alfanar invoices El Seif for electrical works). Payments and cash drop.
2. `constraint_set` notBefore: a steel company says "We pay this invoice in 10 days" (notBefore = scenario date + 10) and an invoice moves to a later round; the plan changes visibly.
3. `payment_marked` with `bankMatch: true`: an invoice was paid outside Tahseel and leaves the network.
4. `payment_marked` with `bankMatch: false`: becomes held ("sides disagree").
5. `proposal_confirmed` "all".
6. `round_executed`: the first round settles; partial set-off appears on invoices split across rounds.
7. `date_advanced` to 2026-10-12: the step-0 held invoice passes 60 days and is escalated; the plan re-solves around it.
8. `invoice_issued`: a new Fatoora invoice after the date change, so judges see re-optimisation in a later state.
The data prompt (P02) must check with the real optimiser that each event actually produces the described effect; adjust amounts or dates until it does.

### 8.7 Small coherent example (illustrates the schema and the maths)
Scenario date 2026-10-03.
```json
[
 {"id":"ZML-2026-0101","sellerId":"ZML","buyerId":"SBG","issueDate":"2026-09-01","dueDate":"2026-10-15","amountExVat":800000,"vat":120000,"total":920000,"status":"open"},
 {"id":"ALF-2026-0102","sellerId":"ALF","buyerId":"ZML","issueDate":"2026-09-05","dueDate":"2026-10-15","amountExVat":600000,"vat":90000,"total":690000,"status":"open"},
 {"id":"SBG-2026-0103","sellerId":"SBG","buyerId":"ALF","issueDate":"2026-09-10","dueDate":"2026-10-20","amountExVat":500000,"vat":75000,"total":575000,"status":"open"},
 {"id":"SBG-2026-0104","sellerId":"SBG","buyerId":"ZML","issueDate":"2026-09-12","dueDate":"2026-10-12","amountExVat":200000,"vat":30000,"total":230000,"status":"open"}
]
```
(Other fields omitted here for brevity.) Windows all contain 2026-10-12, so one round on **2026-10-12** (the latest common day). *[With the weekly round calendar (D16) the latest common round day is **2026-10-10**; the payments and amounts below are unchanged.]* Nets: SBG receives 805,000 and owes 920,000, so it **pays the hub 115,000**; ZML receives 920,000 and owes 920,000, so it makes **no payment**; ALF receives 690,000 and owes 575,000, so the **hub pays it 115,000**.
**Before:** 4 payments, SAR 2,415,000. **After:** 2 payments, SAR 115,000. Set-off = 95.2%. SBG's own view of ZML-2026-0101: SAR 805,000 cleared by set-off, SAR 115,000 paid to hub. This example becomes a unit test (P04).

### 8.8 Reproducibility and reset
Fixed JSON (no random generation at runtime). Events are replayed from step 0 on every change, so step k always gives the same ledger; HiGHS is deterministic for the same LP text, and the LP is built in sorted id order. Reset = step 0. Before and after always use the same ledger at the same step.

---

## 9. Minimal technical architecture

### 9.1 Structure
```
app/
  layout.tsx            # fonts, header, tabs, TimelineStrip, ScenarioProvider, AssistantPanel
  page.tsx              # redirect to /network
  network/page.tsx
  companies/page.tsx
  government/page.tsx
  algorithm/page.tsx
  api/assistant/route.ts  # ONLY server code: Gemini call
components/              # UI components named in §3.4 (one file each)
lib/
  types.ts  schema.ts (Zod)  data.ts (imports JSON, validates)
  ledger.ts               # applyEvents(base, events, step) -> Ledger
  optimizer/windows.ts  buildLp.ts  solveClient.ts  solver.worker.ts  extract.ts  heuristic.ts  validate.ts
  allocation.ts           # per-company invoice split (§5)
  metrics.ts              # §6
  snapshot.ts             # compact JSON for the assistant
  format.ts               # SAR, dates, percentages
  ScenarioProvider.tsx    # context + derived hooks
scripts/validate-data.ts  scripts/copy-highs-wasm.mjs
data/*.json
tests/*.test.ts
```

### 9.2 Routing
App Router; four tab routes share `app/layout.tsx`, so the provider keeps `stepIndex` when switching tabs. The pages are client components (`"use client"`), since everything is interactive and in-memory.

### 9.3 State and derived values
`ScenarioProvider` stores `stepIndex`, `selectedCompanyId`, `selectedRoundDate`, `assistantOpen`. Because `round_executed` needs the plan at the moment it is applied, the **worker** replays events and solves together: it receives `step` and returns `{ step, ledger, plan, previousPlan, eventResults }`, caching per step. `useLedger()` and `usePlan()` read that result (until P04 exists, `useLedger()` is a plain `useMemo(applyEvents(...))`), keeping the last good result while solving. `useMetrics()` = `useMemo(computeMetrics(ledger, plan))`. Components never compute totals themselves; they call `lib/` functions. Also keep `previousPlan` (plan at step − 1) to detect "changed" companies.

### 9.4 JSON loading
Static `import` of `/data/*.json` (bundled at build). `data.ts` runs Zod parsing plus cross-reference checks once at module load; on failure it exports the error list for the error panel.

### 9.5 Solver integration
- `highs` npm package. `scripts/copy-highs-wasm.mjs` (run in `postinstall` and `prebuild`) copies the package's `.wasm` file into `public/solver/`. The worker loads it with `loadHighs({ locateFile: f => "/solver/" + f })`.
- `solver.worker.ts` is created with `new Worker(new URL("./solver.worker.ts", import.meta.url))`. If worker creation fails, run on the main thread (the model is small); if WebAssembly fails entirely, use `heuristic.ts`.
- Tests run the same `buildLp` plus highs in Node (no worker).

### 9.6 Assistant route
`POST /api/assistant` with body `{ question, perspective: "government" | CompanyId, history: {role, text}[] (≤6), snapshot }`.
- Rejects bodies over 30 KB or questions over 500 characters (400).
- Without `GEMINI_API_KEY`, returns 503 `{error:"unavailable"}`.
- A simple in-memory per-IP limit (for example 20 requests per 10 min); this is best-effort on serverless and is documented as such.
- Calls `@google/genai` (`new GoogleGenAI({})` reads `GEMINI_API_KEY`) with `ai.interactions.create({ model: process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite", system_instruction, input })`, as in the Gemini docs checked on 2 Oct 2026. **Re-check the current docs in P09** (API shape and output-length option).
- The system instruction: answer in English, at most 120 words, only from the snapshot; quote SAR figures exactly as given; if the answer is not in the snapshot, say so; for a company perspective, never reveal other companies' data beyond counterparty names on its own invoices; it is a synthetic demo.
- The snapshot is built client-side by `snapshot.ts`: for "government", the metrics, rounds, escalations and per-company totals; for a company, only that company's cards, invoices, schedule and constraints.

### 9.7 Dependencies (each justified)
`next`, `react`, `react-dom`, `tailwindcss` (required stack) · `@xyflow/react` (graph) · `highs` (solver) · `zod` (data validation) · `@google/genai` (assistant) · dev: `vitest`, `tsx` (run the validate script). No state library, no chart library, no UI kit.

### 9.8 Persistence
None. Bundled JSON is read-only; all changes live in memory; refresh = Reset. Nothing writes to the filesystem at runtime.

---

## 10. Visual and interaction design

**Direction:** institutional and calm, inspired by the SAMA and ZATCA websites (white canvas, a strong institutional primary colour, horizontal top navigation, card grids, numbers-first "in numbers" stat blocks, restrained imagery). Do **not** copy their logos or claim to be their product.

**Tokens (Tailwind theme):**
- `ink` #0F172A (text), `muted` #475569, `line` #E2E8F0, `canvas` #FFFFFF, `subtle` #F8FAFC
- `primary` #12355B (deep institutional navy; header, primary buttons, net-payer ring)
- `accent` #0E7C7B (teal; hub, selected state)
- `good` #1B7F4C, `warn` #B7791F, `bad` #B42318
- Round colours (muted, colour-blind-safe order): #12355B, #0E7C7B, #B7791F, #7A4EAB, #C2410C, #4D7C0F
- Font: **IBM Plex Sans** via `next/font/google` (the Plex family is used on Saudi government platforms; the Latin variant suits an English UI). Numbers use `tabular-nums`.

**Avoid the "vibe-coded" look:** no gradients, glassmorphism, emoji, neon glows, oversized rounded corners (max `rounded-md`), floating blobs or decorative animation. Use a 4/8 px spacing grid, one font family, two weights (400/600), thin 1 px dividers, left-aligned text, consistent number formats ("SAR 1,250,000"; compact "SAR 1.25m" only on graph labels) and real labels instead of icons alone.

**Hierarchy:** header, then tabs, then the timeline strip (the main action, "Next event", as the only filled primary button), then page content. On Network: graph about 65% width, right column 35% (counters, then event card, then node card).

**Readability:** node labels ≥12 px; edge labels shown only for the selected round or on hover once there are more than 15 edges; the legend is always visible.

**States:** selected = 2 px teal ring; disabled buttons at 40% opacity with `cursor-not-allowed` and a tooltip explaining why ("Already at first event"); focus rings visible.

**Responsive:** designed for a 1280–1920 px laptop; at <1024 px the Network columns stack (graph on top). Not optimised for phones [Deferred].

**Accessibility:** contrast ≥4.5:1 for text; every colour meaning also has a text label or pattern (dashed, dotted); all controls keyboard-reachable; `aria-live="polite"` on the counters and event card.

---

## 11. Build sequence (estimates for one developer; they are estimates)

| # | Milestone | Prompt | Depends on | Done when | Main risk | Reduced version | Est. |
|---|---|---|---|---|---|---|---|
| 1 | Foundation, shell, tabs, tokens | P01 | — | 4 tabs route; header with "Synthetic data"; lint passes | none | — | 0.75 h |
| 2 | Data model and Saudi dataset | P02 | P01 | `npm run validate` passes; §8.5 structure present | making the cycles meaningful | fewer invoices (25) | 1.5 h |
| 3 | Ledger, events, timeline strip | P03 | P02 | Next/Back/Reset/jump work; ledger tests pass | event edge cases | drop the "blocked" logic | 1.5 h |
| 4 | Optimiser and validator | P04 | P03 | §8.7 test gives 2 payments / SAR 115,000; the full dataset solves "Optimal"; validator all ✓ | WebAssembly in Next/Vercel | heuristic only | 2.5 h |
| 5 | Graph view | P05 | P04 | Before/After, rounds, selection, legend | edge clutter | aggregate edges only, no multi-colour | 2.5 h |
| 6 | Metrics and Government | P06 | P04 | all §6 metrics; tests for formulas | financing walk | drop financing metrics | 1.5 h |
| 7 | Company dashboards | P07 | P04, P06 | allocation sums match; cards match graph | allocation rounding | hide per-invoice split | 1.5 h |
| 8 | Algorithm tab | P08 | P04, P05 | real stats, checks, replay, LP text | — | stats and checks only | 1.25 h |
| 9 | Gemini assistant | P09 | P06, P07 | grounded answers; graceful 503 | API shape changes | government perspective only | 1.25 h |
| 10 | Deploy and demo readiness | P10 | all | public Vercel URL passes the §12 checklist | wasm path on Vercel | — | 1 h |

**Total ≈ 15 h.** Target: milestones 1–5 give a complete small demo (the graph with real re-optimisation); deploy a first preview to Vercel right after P04 to catch WebAssembly hosting problems early.

---

## 12. Validation and demonstration readiness

### 12.1 Automated (Vitest)
- `ledger.test.ts`: each event type; replay determinism (step k twice gives an equal ledger); blocked round execution; escalation on date advance.
- `optimizer.test.ts`: the §8.7 example (2 payments, SAR 115,000, round 2026-10-10 under D16); a pure 3-cycle of equal amounts (0 payments); a notBefore that splits a cycle into two rounds (payments increase); an impossible constraint (break recorded); the full dataset at every step: status Optimal and all validator checks pass.
- `metrics.test.ts`: before/after formulas; zero baseline gives "n/a"; theoretical maximum ≤ 100%; financing walk on a 2-company hand example.
- `allocation.test.ts`: per company per round, Σ set-off + hub legs = Σ settled amounts; rounding to the halala sums exactly.

### 12.2 Consistency checks (shown on the Algorithm tab and tested)
Graph node totals = company cards = sums used in the Government metrics (the same `lib/` functions). Hub pay-ins = pay-outs per round.

### 12.3 Manual checklist (before submission)
- [ ] Public URL opens in a fresh incognito window with no errors in the console.
- [ ] Steps 0→8 with Next; Back to 0; Reset; jump to step 6 from the dropdown: all views agree each time.
- [ ] Rapid clicking of Next ×5 ends on the correct step with the correct numbers.
- [ ] Each scripted event produces its described effect (§8.6).
- [ ] Algorithm tab shows status Optimal and all checks ✓ at every step; the solve time is shown.
- [ ] Assistant answers "How much does Saudi Binladin Group pay the hub?" with the same number as the dashboard; with the key removed, the panel says unavailable and nothing else breaks.
- [ ] "Synthetic data" visible on every page; the 8% figure labelled illustrative.
- [ ] 1366×768 and 1920×1080 layouts readable.

### 12.4 Short demo script (for the slide and for judges' self-exploration)
1. **Network, step 0.** Point to the counters: "Paid one by one, these 35 invoices need 35 payments and SAR X; Tahseel needs Y payments and SAR Z."
2. **Next event (E01).** A new Fatoora invoice closes a cycle; payments and cash drop; the changed companies are badged.
3. **Next (E02).** A company's "pay in 10 days" pushes an invoice to a later round; payments rise slightly. The constraint is respected, not ignored.
4. **Companies → Saudi Binladin Group.** Incoming, outgoing, cleared by set-off, "we pay the hub SAR …" on one date.
5. **Government.** Before/after metrics; set-off share; theoretical maximum.
6. **Algorithm.** "Optimal" status, solve time, validator ticks, round replay.
7. **Assistant:** "Why does Zamil Steel pay nothing in round 1?"
8. **Next to E07.** The held invoice passes 60 days and is escalated.
**Fallback:** Reset returns to the known-good step 0; if the public link fails, run `npm run dev` locally on the laptop with the same data.

### 12.5 Honesty
Every number comes from the synthetic scenario and this model. The prototype shows **how** Tahseel would work and what it computes for this data; it does not show validated real-world impact (v0.2 §1.7: network density and causality are not yet measured).
