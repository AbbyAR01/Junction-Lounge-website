# FarmConnect Ghana

A single Node.js/Express service (CommonJS) that serves a static web UI, a REST API under `/api`, and USSD/SMS webhooks, backed by an embedded SQLite database (`better-sqlite3`). Standard run/build commands live in `package.json` (`start`, `dev`, `seed`) and setup is documented in `README.md`.

## Cursor Cloud specific instructions

- Dependencies are refreshed automatically by the startup update script (`npm install`). No extra install steps are needed.
- The SQLite DB lives at `data/farmconnect.db` and is gitignored, so it does NOT persist as a tracked file. The server auto-creates an empty DB on boot, but for meaningful end-to-end testing you must seed sample data first: `npm run seed`. Seeding is idempotent — it detects existing data and exits early, so it never wipes an already-seeded DB. To force a fresh reseed, delete `data/farmconnect.db` and rerun `npm run seed`.
- Run the dev server with `npm run dev` (uses `node --watch` for hot reload) or `npm start`. It listens on `0.0.0.0:3000` (`PORT` env overrides).
- Outbound SMS is mocked: instead of calling a real gateway, it logs `[SMS → <number>] ...` lines to the server console and writes rows to the `sms_log` table. Watch the server logs to verify SMS-triggering flows (e.g. `POST /api/orders` notifies farmers).
- USSD has no external gateway locally. Test it via the built-in simulator page at `/ussd-simulator`, or POST directly to `/ussd` with form fields `sessionId`, `phoneNumber`, `text` (Africa's Talking compatible).
- There are no lint or automated test scripts in this repo (`package.json` defines only `start`, `dev`, `seed`).
- Seeded test accounts: farmers `0241111001` (Kwame Asante) / `0241111002` (Ama Osei) for the USSD simulator; buyers "Fresh Foods Aggregator", "Junction Lounge Restaurant", "Cape Coast Primary School" for the order form at `/buyer.html`.
