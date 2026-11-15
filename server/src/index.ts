import path from "node:path";
import dotenv from "dotenv";
import { createApp } from "./app";
import { createDatabase } from "./db";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const port = Number(process.env.PORT || 3000);
const databaseUrl = process.env.DATABASE_URL || "./data/store.sqlite";
const { db, close } = createDatabase(databaseUrl);
const server = createApp({ db }).listen(port, () => {
  console.log(`Store management API listening on http://localhost:${port}`);
});

function shutdown() {
  server.close(() => {
    close();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
