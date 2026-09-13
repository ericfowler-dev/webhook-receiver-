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

## How the numbers work

Per year, costs grow by the inflation rate you set. Money is applied in this
order:

```
gift aid → family cash + student earnings → savings/529 → loans cover the rest
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

- The starting numbers are **placeholders**. Replace them with figures from each
  school's actual cost of attendance and award letter.
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
