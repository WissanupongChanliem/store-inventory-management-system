import { createHash, randomBytes } from "node:crypto";
import type { RequestHandler } from "express";
import { eq } from "drizzle-orm";
import type { AppDatabase } from "../db";
import { sessions } from "../db";

const sessionMaxAge = 1000 * 60 * 60 * 24 * 1; // 1 day

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
    const tokenHash = hashSessionId(token);
    const session = db
      .select({
        userId: sessions.userId,
        username: sessions.username,
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
    res.locals.username = session.username;
    next();
  };
}

export { createSessionId, hashSessionId, requireSession, sessionMaxAge };
