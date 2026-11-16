import { createHash, randomBytes } from "node:crypto";
import type { Request, RequestHandler, Response } from "express";
import { eq } from "drizzle-orm";
import type { AppDatabase } from "../db";
import { sessions } from "../db";
import { send } from "node:process";

function createSessionId(): string {
  return randomBytes(32).toString("base64url");
}

function hashSessionId(sessionId: string): string {
  return createHash("sha256").update(sessionId).digest("hex");
}

function requireSession(db: AppDatabase): RequestHandler {
  return (req, res, next) => {
    const token = req.cookies.sid;
    if (!token) {
      return res.status(401).json({
        error: {
          code: "UNAUTHENTICATED",
          message: "Authentication required",
        },
      });
    }

    const tokenHash = createHash("sha256").update(token).digest("hex");
    const session = db
      .select({
        userId: sessions.userId,
        expiresAt: sessions.expiresAt,
      })
      .from(sessions)
      .where(eq(sessions.tokenHash, tokenHash))
      .get();

    if (!session || session.expiresAt <= new Date().toISOString()) {
      return res.status(401).json({
        error: {
          code: "UNAUTHENTICATED",
          message: "Authentication required",
        },
      });
    }

    res.locals.userId = session.userId;
    next();
  };
}

export { createSessionId, hashSessionId, requireSession };
