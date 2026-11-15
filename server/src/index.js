const path = require("node:path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const { createApp } = require("./app");
const { createDatabase } = require("./db");

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
