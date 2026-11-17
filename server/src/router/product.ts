import express from 'express';
import { requireSession } from '../middleware/session';
import { AppDatabase, lower, products } from '../db';
import { asc, count, eq, or, sql, SQL } from 'drizzle-orm';
import { getUnknownFields } from '../utils/request';

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

        let unknownFields = getUnknownFields(['name', 'priceSatang', 'amount'], req.body);
        if (unknownFields.length > 0) {
            return res.status(422).json({
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Unexpected fields in request body',
                    details: unknownFields.map(field => ({ field, message: `${field} is not allowed` }))
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

    router.patch('/:id', requireSession(db), async (req, res) => {
        const productId = Number(req.params.id);
        const name = req.body.name;
        const amount = req.body.amount;
        const priceSatang = req.body.priceSatang;

        if (!Number.isSafeInteger(productId) || productId < 1) {
            return res.status(400).json({
                error: {
                    code: 'BAD_REQUEST',
                    message: 'Invalid product ID',
                }
            });
        }

        if (name === undefined && amount === undefined && priceSatang === undefined) {
            return res.status(422).json({
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'At least one of name, amount, or priceSatang must be provided for update',
                    details: [
                        { field: 'name', message: 'Product name is required for update' },
                        { field: 'amount', message: 'Product amount is required for update' },
                        { field: 'priceSatang', message: 'Product price is required for update' }
                    ]
                }
            });
        }
        let unknownFields = getUnknownFields(['name', 'amount', 'priceSatang'], req.body);
        
        if (unknownFields.length > 0) {
            return res.status(422).json({
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Unexpected fields in request body',
                    details: unknownFields.map(field => ({ field, message: `${field} is not allowed` }))
                }
            });
        }

        let details: { field: string; message: string }[] = [];
        if (name !== undefined && (typeof name !== 'string' || name.trim() === '' || name.trim().length > 100)) {
            details.push({ field: 'name', message: 'Product name must be a non-empty string with length not exceeding 100 characters' });
        }
        if (amount !== undefined && (typeof amount !== 'number' || !Number.isInteger(amount) || amount < 0 || amount > 1000000)) {
            details.push({ field: 'amount', message: 'Product amount must be an integer between 0 and 1,000,000' });
        }
        if (priceSatang !== undefined && (typeof priceSatang !== 'number' || !Number.isInteger(priceSatang) || priceSatang < 0 || priceSatang > 100000000)) {
            details.push({ field: 'priceSatang', message: 'Product price must be an integer between 0 and 100,000,000' });
        }
        if (details.length > 0) {
            return res.status(422).json({
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Invalid field values',
                    details: details
                }
            });
        }

        if (name !== undefined) {
            const existingProduct = db.select().from(products).where(eq(lower(products.name), name.trim().toLowerCase())).get();
            if (existingProduct && existingProduct.id !== productId) {
                return res.status(409).json({
                    error: {
                        code: 'PRODUCT_NAME_EXISTS',
                        message: 'Product with the same name already exists',
                    }
                });
            }
        }

        const existingProduct = db.select().from(products).where(eq(products.id, productId)).get();
        if (!existingProduct) {
            return res.status(404).json({
                error: {
                    code: 'PRODUCT_NOT_FOUND',
                    message: 'Product not found',
                }
            });
        }

        const updateData: Partial<typeof products.$inferInsert> = {};
        if (name !== undefined) {
            updateData.name = req.body.name.trim();
        }
        if (amount !== undefined) {
            updateData.amount = req.body.amount;
        }
        if (priceSatang !== undefined) {
            updateData.priceSatang = req.body.priceSatang;
        }
        updateData.updatedAt = new Date().toISOString();

        const updatedProduct = db.update(products).set(updateData).where(eq(products.id, productId)).returning().get();
        return res.status(200).json({ product: updatedProduct });
    })

    router.delete('/:id', requireSession(db), async (req, res) => {
        const productId = Number(req.params.id);

        if (!Number.isSafeInteger(productId) || productId < 1) {
            return res.status(400).json({
                error: {
                    code: 'BAD_REQUEST',
                    message: 'Invalid product ID',
                }
            });
        }

        const existingProduct = db.select().from(products).where(eq(products.id, productId)).get();
        if (!existingProduct) {
            return res.status(404).json({
                error: {
                    code: 'PRODUCT_NOT_FOUND',
                    message: 'Product not found',
                }
            });
        }

        db.delete(products).where(eq(products.id, productId)).run();
        return res.status(204).send();
    })


    return router;
}

export { getProductRouter };