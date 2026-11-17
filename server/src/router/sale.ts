import express from 'express';
import { requireSession } from '../middleware/session';
import { AppDatabase, sales } from '../db';
import { and, count, desc, gte, lt, sql, sum } from 'drizzle-orm';

function isValidDate(date: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return false;
    }

    const parsedDate = new Date(`${date}T00:00:00.000Z`);
    return !Number.isNaN(parsedDate.getTime()) && parsedDate.toISOString().slice(0, 10) === date;
}

function getDateInTimeZone(date: Date, timeZone: string): string {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(date);
    const year = parts.find(part => part.type === 'year')?.value;
    const month = parts.find(part => part.type === 'month')?.value;
    const day = parts.find(part => part.type === 'day')?.value;

    return `${year}-${month}-${day}`;
}

function getTimeZoneOffset(date: Date, timeZone: string): number {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23'
    }).formatToParts(date);
    const getPart = (type: string) => Number(parts.find(part => part.type === type)?.value);
    const localDateAsUtc = Date.UTC(
        getPart('year'),
        getPart('month') - 1,
        getPart('day'),
        getPart('hour'),
        getPart('minute'),
        getPart('second')
    );

    return localDateAsUtc - date.getTime();
}

function getStartOfDay(date: string, timeZone: string): Date {
    const [year, month, day] = date.split('-').map(Number);
    const localMidnightAsUtc = Date.UTC(year, month - 1, day);
    let utcTimestamp = localMidnightAsUtc;

    for (let attempt = 0; attempt < 2; attempt++) {
        utcTimestamp = localMidnightAsUtc - getTimeZoneOffset(new Date(utcTimestamp), timeZone);
    }

    return new Date(utcTimestamp);
}

function getNextDate(date: string): string {
    const nextDate = new Date(`${date}T00:00:00.000Z`);
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);
    return nextDate.toISOString().slice(0, 10);
}

function getSaleRouter(db: AppDatabase) {
    const router = express.Router();

    router.get('/', requireSession(db), async (req, res) => {
        const requestedDate = req.query.date;
        if (requestedDate !== undefined && (
            typeof requestedDate !== 'string'
            || !isValidDate(requestedDate)
        )) {
            return res.status(400).json({
                error: {
                    code: 'BAD_REQUEST',
                    message: 'Invalid date format. Please use YYYY-MM-DD.'
                }
            });
        }
        const timeZone = process.env.STORE_TIMEZONE || 'Asia/Bangkok';
        const date = typeof requestedDate === 'string'
            ? requestedDate
            : getDateInTimeZone(new Date(), timeZone);
        const start = getStartOfDay(date, timeZone).toISOString();
        const end = getStartOfDay(getNextDate(date), timeZone).toISOString();
        const dateCondition = and(
            gte(sales.createdAt, start),
            lt(sales.createdAt, end)
        );
        const summary = db.select({
            saleCount: count(),
            totalSatang: sum(sales.totalSatang)
        })
            .from(sales)
            .where(dateCondition)
            .get();
        const saleItemsList = await db.query.sales.findMany({
            with: {
                items: true
            },
            where: dateCondition,
            orderBy: [desc(sales.createdAt), desc(sales.id)]
        });

        return res.status(200).json({
            date,
            timezone: timeZone,
            summary: {
                saleCount: summary?.saleCount ?? 0,
                totalSatang: Number(summary?.totalSatang ?? 0)
            },
            items: saleItemsList
        });
    })

    return router;
}

export { getSaleRouter };