import express from 'express';
import bcrypt from 'bcrypt';
import type { AppDatabase } from '../db';
import { randomBytes, createHash } from 'node:crypto';

import { sessions, users } from '../db';
import { eq } from 'drizzle-orm/sql/expressions/conditions';
import { requireSession } from '../middleware/session';

function getAuthRouter(db: AppDatabase) {
    const router = express.Router();

    router.post('/login', async (req, res) => {
    if (!req.body.username || !req.body.password || typeof req.body.username !== 'string' || typeof req.body.password !== 'string' || req.body.username.trim() === '' || req.body.password.trim() === '' ) {
        return res.status(422).json({
            error: {code: 'VALIDATION_ERROR',
                message : 'Missing username or password',
                details : [{field: 'username', message: 'Username is required'}, {field: 'password', message: 'Password is required'}]
            }
        });
    }

    if (Object.keys(req.body).length > 2) {
        return res.status(422).json({
            error: {code: 'VALIDATION_ERROR',
                message : 'Unexpected fields in request body',
                details : Object.keys(req.body).filter(key => !['username', 'password'].includes(key)).map(field => ({field, message: `${field} is not allowed`}))
            }
        });
    }

    let user = db.select().from(users)
    .where(eq(
        users.username, req.body.username
    )).get();

    if (!user) {
        return res.status(401).json({
            error: {code: 'INVALID_CREDENTIALS', message : 'Invalid username or password' }
        });
    }

    const isMatch = await bcrypt.compare(req.body.password, user.passwordHash);

    if (!isMatch) {
        return res.status(401).json({
            error: {code: 'INVALID_CREDENTIALS', message : 'Invalid username or password' }
        });
    }

    let sessionId = randomBytes(32).toString("base64url")
    let cookieOptions: express.CookieOptions = {
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 1000 * 60 * 60 * 24 * 1, // 1 day
        secure: true,
    }
    res.cookie('sid', sessionId, cookieOptions);

    db.insert(sessions).values({
        tokenHash:createHash("sha256").update(sessionId).digest("hex"),
        userId: user.id,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 1).toISOString(), // 1 day
    })

    res.status(200).json({
        user : {
            id: user.id,
            username: user.username,
        },

    });
    });

    router.get('/me', requireSession(db), async (req, res) => {
        // For demonstration purposes, we will just return a dummy user object.
        // In a real application, you would retrieve the user from the database based on the session ID.

        res.status(200).json({
            user: {
                id: res.locals.userId,
                username: db.select().from(users).where(eq(users.id, res.locals.userId)).get()?.username || 'Unknown',
            },
        })
    })

    router.post('/logout', async (req, res) => {
        const token = req.cookies.sid;
        if (token) {
            db.delete(sessions).where(eq(sessions.tokenHash, createHash("sha256").update(token).digest("hex"))).run();
        }
        let cookieOptions: express.CookieOptions = {
            httpOnly: true,
            sameSite: 'lax',
            maxAge: 1000 * 60 * 60 * 24 * 1, // 1 day
            secure: true,
        }
        res.clearCookie('sid', cookieOptions);
        res.status(204).send();
    });

    return router;
}

export { getAuthRouter };