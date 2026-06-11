# Fairman Family Budget Dashboard — Refactored Package

This package was created from the uploaded working-ish `index.html` without rewriting calculation logic.

## What changed

- CSS was extracted into `css/styles.css`.
- JavaScript was extracted into `js/app.js`.
- The inline `initialData` JSON stayed inside `index.html`.
- Script order was preserved exactly by concatenating the original script blocks into `js/app.js` in the same order.
- No budget, cash-flow, debt, bill, split, sync, or rendering logic was intentionally changed.

## Why this is safer

Future fixes should be made in `js/app.js` by editing the relevant section instead of appending another version patch to the bottom of the file.

## Next recommended cleanup

The next pass should consolidate duplicate function definitions so each function exists once:

- transaction calculations
- split calculations
- bill/debt confirmation
- cash flow forecast
- Smart Carryover Adjuster
- rendering functions
- sheet sync/import

For now, this package is behavior-preserving rather than logic-rewriting.
