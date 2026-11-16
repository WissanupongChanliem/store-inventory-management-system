import express from 'express';
import bcrypt from 'bcrypt';
import type { AppDatabase } from '../db';
import { randomBytes} from 'node:crypto';

import { sessions, users } from '../db';
import { eq } from 'drizzle-orm/sql/expressions/conditions';
import { hashSessionId, requireSession, sessionMaxAge } from '../middleware/session';

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

    const sessionId = randomBytes(32).toString("base64url");
    const cookieOptions: express.CookieOptions = {
        path: "/",
        httpOnly: true,
        sameSite: 'lax',
        maxAge: sessionMaxAge,
        secure: req.secure,
    };
    res.cookie('sid', sessionId, cookieOptions);

    db.insert(sessions).values({
        tokenHash: hashSessionId(sessionId),
        userId: user.id,
        username: user.username,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + sessionMaxAge).toISOString(), // 1 day
    }).run();

    res.status(200).json({
        user : {
            id: user.id,
            username: user.username,
        },

    });
    });

    router.get('/me', requireSession(db), async (req, res) => {
        res.status(200).json({
            user: {
                id: res.locals.userId,
                username: res.locals.username,
            },
        })
    })

    router.post('/logout', async (req, res) => {
        const token = req.cookies.sid;
        if (token) {
            db.delete(sessions).where(eq(sessions.tokenHash, hashSessionId(token))).run();
        }
        const cookieOptions: express.CookieOptions = {
            path: "/",
            httpOnly: true,
            sameSite: 'lax',
            secure: req.secure,
        };
        res.clearCookie('sid', cookieOptions);
        res.status(204).send();
    });

    router.patch('/me', requireSession(db), async (req, res) => {
        let { currentPassword, newPassword, newUsername } = req.body;
        if (currentPassword === undefined || (newPassword === undefined && newUsername === undefined)) {
            let details: { field: string; message: string }[] = [];
            if (currentPassword === undefined) {
                details.push({ field: 'currentPassword', message: 'Current password is required' });
            }
            if (newPassword === undefined) {
                details.push({ field: 'newPassword', message: 'New password is required' });
            }
            if (newUsername === undefined) {
                details.push({ field: 'newUsername', message: 'New username is required' });
            }
            return res.status(422).json({
                error: {code: 'VALIDATION_ERROR',
                    message : 'Missing required fields',
                    details : details
                }
            });
        }
        
        if (typeof currentPassword !== 'string' || (newPassword !== undefined && typeof newPassword !== 'string') || (newUsername !== undefined && typeof newUsername !== 'string')) {
            let details: { field: string; message: string }[] = [];
            if (typeof currentPassword !== 'string') {
                details.push({ field: 'currentPassword', message: 'Current password must be a string' });
            }
            if (newPassword && typeof newPassword !== 'string') {
                details.push({ field: 'newPassword', message: 'New password must be a string' });
            }
            if (newUsername && typeof newUsername !== 'string') {
                details.push({ field: 'newUsername', message: 'New username must be a string' });
            }
            return res.status(422).json({
                error: {code: 'VALIDATION_ERROR',
                    message : 'Invalid field types',
                    details : details
                }
            });
        }

        if (currentPassword.trim() === '' || (newPassword !== undefined && newPassword.trim() === '' || newUsername !== undefined && newUsername.trim() === '')) {
            let details: { field: string; message: string }[] = [];
            if (currentPassword && currentPassword.trim() === '') {
                details.push({ field: 'currentPassword', message: 'Current password cannot be empty' });
            }
            if (newPassword !== undefined && newPassword.trim() === '') {
                details.push({ field: 'newPassword', message: 'New password cannot be empty' });
            }
            if (newUsername !== undefined && newUsername.trim() === '') {
                details.push({ field: 'newUsername', message: 'New username cannot be empty' });
            }
            return res.status(422).json({
                error: {code: 'VALIDATION_ERROR',
                    message : 'Invalid field values',
                    details : details
                }
            });
        }

        const allowedFields = new Set(['currentPassword', 'newPassword', 'newUsername']);
        if ( Object.keys(req.body).some(field => !allowedFields.has(field))) {
            return res.status(422).json({
                error: {code: 'VALIDATION_ERROR',
                    message : 'Unexpected fields in request body',
                    details : Object.keys(req.body).filter(key => !allowedFields.has(key)).map(field => ({field, message: `${field} is not allowed`}))
                }
            });
        }

        if (
            (newUsername !== undefined && (newUsername.trim().length < 1 || newUsername.trim().length > 100))
            || (newPassword !== undefined && (newPassword.length < 12 || newPassword.length > 128))) {
            return res.status(422).json({
                error: {code: 'VALIDATION_ERROR',
                    message : 'Invalid field values',
                    details : [
                        ...(newUsername !== undefined && (newUsername.trim().length < 1 || newUsername.trim().length > 100) ? [{field: 'newUsername', message: 'New username must be between 1 and 100 characters'}] : []),
                        ...(newPassword !== undefined && (newPassword.length < 12 || newPassword.length > 128) ? [{field: 'newPassword', message: 'New password must be between 12 and 128 characters'}] : [])
                    ]
                }
            });
        }

        let currentPasswordHash = db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, res.locals.userId)).get();
        if (!currentPasswordHash) {
            return res.status(404).json({
                error: {code: 'USER_NOT_FOUND', message : 'User not found' }
            });
        }
        const isMatch = await bcrypt.compare(currentPassword, currentPasswordHash.passwordHash);
        if (!isMatch) {
            return res.status(401).json({
                error: {code: 'INVALID_CREDENTIALS', message : 'Invalid current password' }
            });
        }

        const updates: { passwordHash?: string; username?: string } = {};
        if (newPassword) {
            updates.passwordHash = await bcrypt.hash(newPassword, 10);
        }
        if (newUsername) {
            updates.username = newUsername.trim();
        }

        const updatedUser = db.update(users).set(updates).where(eq(users.id, res.locals.userId)).returning({ id: users.id, username: users.username }).get();
        
        if (req.cookies.sid) {
            db.delete(sessions).where(eq(sessions.userId, res.locals.userId)).run();
        }
        const cookieOptions: express.CookieOptions = {
            path: "/",
            httpOnly: true,
            sameSite: 'lax',
            secure: req.secure,
        };
        res.clearCookie('sid', cookieOptions);
        return res.status(200).json({
            user: updatedUser,
        });
    });

    return router;
}

export { getAuthRouter };