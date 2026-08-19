import { openDb } from "./db";
import { createApp } from "./app";

// Deliberately NOT reading the generic `PORT` env var here: this repo runs two
// servers under one `npm run dev` (vite on 5173 + this API on 3001), and many
// hosting/preview tools inject `PORT` expecting a single process to bind it —
// which would collide with vite's own port. `API_PORT` is this server's own,
// unambiguous knob; `vite.config.ts`'s proxy target must stay in sync with it.
const PORT = Number(process.env.API_PORT ?? 3001);
const db = openDb(process.env.DB_PATH ?? "server/data/layouts.db");
createApp(db).listen(PORT, () => {
  console.log(`gear-sandbox server listening on :${PORT}`);
});
