import express from 'express';
import { requireSession } from '../middleware/session';
import { AppDatabase, lower, products } from '../db';
import { eq } from 'drizzle-orm';

function getProductRouter(db: AppDatabase) {
    const router = express.Router();

    router.post('/', requireSession(db), async (req, res) => {
        if (!req.body.name || !req.body.priceSatang || !req.body.amount
            || typeof req.body.name !== 'string'
            || typeof req.body.priceSatang !== 'number'
            || typeof req.body.amount !== 'number'
            || !Number.isInteger(req.body.priceSatang)
            || !Number.isInteger(req.body.amount)
            || req.body.name.trim() === ''
            || req.body.priceSatang < 0
            || req.body.priceSatang > 100000000
            || req.body.amount < 0
            || req.body.amount > 1000000
        ) {
            return res.status(422).json({
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Missing or invalid product name or price',
                    details: [req.body.name ? null : { field: 'name', message: 'Product name is required' },
                    req.body.priceSatang ? null : { field: 'priceSatang', message: 'Product price is required' },
                    req.body.amount ? null : { field: 'amount', message: 'Product amount is required' }].fill(null).filter(detail => detail !== null)
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
        res.status(201).json({ "product": product });
    })



    return router;
}

export { getProductRouter };