import { randomUUID } from "node:crypto";
import express from "express";
import { sql } from "drizzle-orm";
import type { AppDatabase } from "./db";
import { getAuthRouter } from "./router/auth";
import cookieParser from "cookie-parser";
import { malformedJsonHandler } from "./middleware/malformed-json";

declare global {
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

export function createApp({ db }: { db: AppDatabase }) {
  const app = express();
  const allowedOrigin = process.env.CORS_ORIGIN ?? "http://localhost:5173";
  //CORS
  app.use((req, res, next) => {
    if (req.headers.origin === allowedOrigin) {
      res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      res.setHeader("Vary", "Origin");
    }
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.use(cookieParser());

  app.use((req, res, next) => {
    req.requestId = randomUUID();
    next();
  });
  app.use(express.json());

  app.get("/api/health", (req, res) => {
    try {
      db.get(sql`SELECT 1`);
      res.json({ status: "ok" });
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

  app.use(malformedJsonHandler);

  app.use("/api/auth", getAuthRouter(db));
  app.use("/api/products", require("./router/product").getProductRouter(db));

  return app;
}
