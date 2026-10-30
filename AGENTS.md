# BABB Developer & Agent Guidelines

## 1. Definition of Done
- **Confirm the intended changes are actually present**.
- **Run the validation suite**: Before declaring any task complete, run `npm run validate` (which runs `npm run check` and `npm test`). All checks and tests must pass with 0 failures and 0 warnings.

## 2. Testing Philosophy: High-Value, Pragmatic Testing
- **Test real business logic**: Focus tests on data transformations, metrics aggregations, sorting/ranking, and date math. Do not test third-party libraries.
- **Test against messy real-world data**: Sheet music records frequently have missing fields, `null`, `"?"`, `"-"`, compound strings (e.g. `"Composer A/Composer B"`), or 0 plays. Tests should prove the app handles these gracefully.
- **Test inputs and outputs, not mocks**: Keep tests fast, pure, and deterministic using Node's native runner (`node --test`). Avoid brittle mock-heavy tests.

## 3. Architecture: Pure Logic vs. Side Effects
- **Pure calculations**: Keep domain math and data transformations isolated in `*-calc.js` modules with no DOM or Firebase dependencies.
- **UI & Controller**: Keep DOM manipulation, Chart.js rendering, and Firestore calls in page scripts (`history.js`, `script.js`).

## 4. Environment & Data Safety
- **Live Database**: Local dev (`npm run dev`) connects to the live Firestore database. Analytical pages must remain strictly read-only. Any write operations require explicit transactions, validations, and duplicate checks.
- **ES Modules & Globals**: The app runs pure browser ES modules without a bundler. When sharing configs (like `firebase-config.js`), ensure explicit `window` attachment.
