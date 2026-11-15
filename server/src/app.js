const { randomUUID } = require("node:crypto");
const express = require("express");
const { sql } = require("drizzle-orm");

function createApp({ db }) {
  const app = express();

  app.use(express.json());
  app.use((req, res, next) => {
    req.requestId = randomUUID();
    next();
  });

  app.get("/api/health", (req, res) => {
    try {
      db.get(sql`SELECT 1`);
      res.json({ data: { status: "ok" } });
    } catch {
      res.status(503).json({
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Service unavailable",
          requestId: req.requestId,
        },
      });
    }
  });

  return app;
}

module.exports = { createApp };
