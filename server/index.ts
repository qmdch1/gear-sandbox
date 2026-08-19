import { openDb } from "./db";
import { createApp } from "./app";

const PORT = Number(process.env.PORT ?? 3001);
const db = openDb(process.env.DB_PATH ?? "server/data/layouts.db");
createApp(db).listen(PORT, () => {
  console.log(`gear-sandbox server listening on :${PORT}`);
});
