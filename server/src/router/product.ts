import express from 'express';
import { requireSession } from '../middleware/session';
import { AppDatabase, lower, products } from '../db';
import { asc, count, eq, or, sql, SQL } from 'drizzle-orm';

function getProductRouter(db: AppDatabase) {
    const router = express.Router();

    router.post('/', requireSession(db), async (req, res) => {
        if (req.body.name === undefined || req.body.priceSatang === undefined || req.body.amount === undefined
            || typeof req.body.name !== 'string'
            || typeof req.body.priceSatang !== 'number'
            || typeof req.body.amount !== 'number'
            || !Number.isInteger(req.body.priceSatang)
            || !Number.isInteger(req.body.amount)
            || req.body.name.trim().length > 100
            || req.body.name.trim() === ''
            || req.body.priceSatang < 0
            || req.body.priceSatang > 100000000
            || req.body.amount < 0
            || req.body.amount > 1000000
        ) {
            let details = [];
            if (req.body.name === undefined || typeof req.body.name !== 'string' || req.body.name.trim() === '' || req.body.name.trim().length > 100) {
                details.push({ field: 'name', message: 'Product name is required and must be a non-empty string with length not exceeding 100 characters' });
            }
            if (req.body.priceSatang === undefined || typeof req.body.priceSatang !== 'number' || !Number.isInteger(req.body.priceSatang) || req.body.priceSatang < 0 || req.body.priceSatang > 100000000) {
                details.push({ field: 'priceSatang', message: 'Product price must be an integer between 0 and 100,000,000' });
            }
            if (req.body.amount === undefined || typeof req.body.amount !== 'number' || !Number.isInteger(req.body.amount) || req.body.amount < 0 || req.body.amount > 1000000) {
                details.push({ field: 'amount', message: 'Product amount must be an integer between 0 and 1,000,000' });
            }
            return res.status(422).json({
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Missing or invalid product name or price',
                    details: details
                }
            });
        }
        if (Object.keys(req.body).length > 3) {
            return res.status(422).json({
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Unexpected fields in request body',
                    details: Object.keys(req.body).filter(key => !['name', 'priceSatang', 'amount'].includes(key)).map(field => ({ field, message: `${field} is not allowed` }))
                }
            });
        }

        if (db.select().from(products).where(eq(lower(products.name), req.body.name.trim().toLowerCase())).get()) {
            return res.status(409).json({
                error: {
                    code: 'PRODUCT_NAME_EXISTS',
                    message: 'Product with the same name already exists'
                }
            });
        }

        let input = {
            name: req.body.name.trim(),
            priceSatang: req.body.priceSatang,
            amount: req.body.amount,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        }
        const product = db.insert(products).values(input).returning().get();
        return res.status(201).json({ "product": product });
    })

    router.get('/', requireSession(db), async (req, res) => {
        const searchParam = req.query.search;
        const limitParam = req.query.limit;
        const offsetParam = req.query.offset;

        if (limitParam !== undefined && (
            typeof limitParam !== 'string'
            || !/^\d+$/.test(limitParam)
            || Number(limitParam) < 1
            || Number(limitParam) > 200
            || !Number.isSafeInteger(Number(limitParam))
        )) {
            return res.status(400).json({
                error: {
                    code: 'BAD_REQUEST',
                    message: 'Invalid limit value',
                }
            });
        }
        if (offsetParam !== undefined && (
            typeof offsetParam !== 'string'
            || !/^\d+$/.test(offsetParam)
            || !Number.isSafeInteger(Number(offsetParam))
        )) {
            return res.status(400).json({
                error: {
                    code: 'BAD_REQUEST',
                    message: 'Invalid offset value',
                }
            });
        }
        if (searchParam !== undefined && typeof searchParam !== 'string') {
            return res.status(400).json({
                error: {
                    code: 'BAD_REQUEST',
                    message: 'Invalid search value',
                }
            });
        }

        const search = typeof searchParam === 'string' ? searchParam.trim().toLowerCase() : '';
        const limit = limitParam === undefined ? 50 : Number(limitParam);
        const offset = offsetParam === undefined ? 0 : Number(offsetParam);
        let condition: SQL = sql`1 = 1`;
        if (search) {
            condition = sql`instr(${lower(products.name)}, ${search}) > 0`;
            if (/^\d+$/.test(search)) {
                const searchId = Number(search);
                if (Number.isSafeInteger(searchId)) {
                    condition = or(condition, eq(products.id, searchId)) ?? condition;
                }
            }
        }

        const total = db
            .select({ total: count() })
            .from(products)
            .where(condition)
            .get()?.total ?? 0;
        const productList = db
            .select()
            .from(products)
            .where(condition)
            .orderBy(lower(products.name), asc(products.id))
            .limit(limit)
            .offset(offset)
            .all();

        return res.status(200).json({ items: productList, total, limit, offset });
    })

    return router;
}

export { getProductRouter };