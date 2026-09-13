# College Fit Dashboard

A single-screen dashboard for comparing colleges on weighted priorities, a
four-year cash-flow model, and subjective fit factors. Everything recalculates
as you type.

## Running it

There is no build step and no backend. Open `index.html` in a browser, or serve
the folder:

```bash
python3 -m http.server 8000 --directory college-fit-dashboard
# then open http://localhost:8000
```

## Deploying to Render (static site, free tier)

This folder is the publish directory — Render serves it as-is.

1. Render Dashboard → **New** → **Static Site**, pointed at this repository.
2. **Build command:** leave empty.
3. **Publish directory:** `college-fit-dashboard`
4. Deploy. Cost is $0 on the free static-site tier.

The repository's existing `server.js` webhook receiver is a separate Web
Service and is unaffected — a static site and a web service can run side by
side from one repo.

## What it does

| Panel | What it answers |
|---|---|
| **The ranking** | Which school wins once your priorities are weighted, and which priorities drove the result |
| **Your priorities** | How much each factor matters (0–10). Set a weight to 0 to drop it |
| **How each school scores** | Your 1–10 gut-check per school per priority |
| **The money** | Costs, gift aid, family contribution, savings and loan terms per school |
| **Cash flow, year by year** | What gets borrowed each year, the monthly payment after graduation, and the strain on a starting salary |
| **Who pays the bill** | The whole degree split by source, with loans counted at their post-interest cost |

## Periods: every amount says what clock it is on

Money arrives on different schedules. Tuition is billed by the year or the
semester; a part-time job pays monthly; a 529 is a single pot. Mixing those up
silently is the easiest way to get a wrong answer, so each amount is stored
exactly as you typed it **plus the period you picked**, and the engine converts
to an annual figure on read. Nothing monthly is ever added to something annual.

Each input shows a period selector and the same amount on the other clock:

| Period | Multiplier | Typical use |
|---|---|---|
| per year | ×1 | published cost of attendance |
| per semester | ×2 | tuition bills and award letters |
| per month, school year | ×9 | dorm contracts, a term-time job |
| per month, all year | ×12 | a family's monthly contribution |
| one-time total | — | savings and 529 balances |

Switching the period converts the amount so the yearly total holds steady —
$6,000 per year becomes $500 per month, not $6,000 per month.

Outputs state their period too: the loan payment is **per month**, totals are
labeled **total**, and the cash-flow table has a **per year / per month** toggle
(annual figures spread across 12 months) for budgeting against a paycheck.

## How the numbers work

Per year, costs grow by the inflation rate you set. Money is applied in this
order:

```
gift aid → family contribution + student job income → savings/529 → loans cover the rest
```

- **In-school interest** accrues on each year's borrowing from mid-year to
  graduation, matching unsubsidized-loan behavior.
- **Monthly payment** is a standard amortized payment on the graduation balance
  over the repayment term.
- **Salary strain** is that payment as a share of expected starting gross pay:
  under 8% comfortable, 8–12% manageable, over 12% tight.
- **Affordability** is scored automatically from total lifetime cost to the
  family (out of pocket + every loan payment). The cheapest school scores 10 and
  the others scale by ratio, so a school costing twice as much scores 5.

## Data and privacy

State lives in `localStorage` under the key `collegeFitDashboard` — this browser
only, never uploaded. **Export** downloads a JSON file; **Import** restores one
(and is validated, so a corrupt file falls back to the defaults rather than
breaking the page). **Reset** restores the starting example.

## Notes

- The starting numbers are **placeholders** — plausible shapes, not real published
  figures. Replace them with each school's actual cost of attendance and award
  letter. (The example compares Mizzou against Illinois State, with ISU's tuition
  entered per semester and its housing per month to show the period handling.)
- Up to **4 schools** and **8 priorities**. Both caps exist because the chart
  color palette is validated for colorblind-safe separation at those sizes —
  raising them would mean re-validating the palette.
- Estimates only, not financial advice.

## Files

```
index.html   markup and panel structure
styles.css   design tokens, layout, light/dark themes
app.js       state, finance engine, scoring, rendering
```

No dependencies, no network calls, no analytics.
