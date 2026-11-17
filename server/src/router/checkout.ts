import express from 'express';
import { requireSession } from '../middleware/session';
import { AppDatabase, Product, products, saleItems, sales } from '../db';
import { eq } from 'drizzle-orm/sql/expressions/conditions';
import { sql } from 'drizzle-orm/sql/sql';


export function getCheckoutRouter(db: AppDatabase) {
    const router = express.Router();

    router.post('/', requireSession(db), async (req, res) => {
        if (!req.body.items || !Array.isArray(req.body.items) || req.body.items.length === 0) {
            return res.status(422).json({
                error: { code: 'VALIDATION_ERROR', message: 'Items array is required and cannot be empty', details: [{ field: 'items', message: 'Items array is required and cannot be empty' }] }
            });
        }

        if (Object.keys(req.body).length !== 1) {
            return res.status(422).json({
                error: { code: 'VALIDATION_ERROR', message: 'Unexpected fields in request body', details: Object.keys(req.body).filter(key => key !== 'items').map(field => ({ field, message: `${field} is not allowed` })) }
            });
        }

        if (req.body.items.some((item: any) => item.productId === undefined || item.quantity === undefined || typeof item.productId !== 'number' || typeof item.quantity !== 'number' || item.quantity <= 0 || !Number.isInteger(item.quantity) || !Number.isInteger(item.productId) || Object.keys(item).length !== 2)) {
            if (Object.keys(req.body).length !== 2) {
                return res.status(422).json({
                    error: { code: 'VALIDATION_ERROR', message: 'Unexpected fields in request body',
                        details: Object.keys(req.body).filter(key => key !== 'productId').filter(key => key !== 'quantity').map(field => ({ field, message: `${field} is not allowed` })) }
                });
            }
            return res.status(422).json({
                error: { code: 'VALIDATION_ERROR', message: 'Each item must have a valid productId and quantity' }
            });
        }

        let productIds = new Set(req.body.items.map((item: any) => item.productId));
        if (productIds.size !== req.body.items.length) {
            return res.status(422).json({
                error: { code: 'VALIDATION_ERROR',
                    message: 'Duplicate product IDs are not allowed',
                    details: [{ field: 'items', message: 'Duplicate product IDs are not allowed' }] }
            });
        }

        let totalAmount = 0;
        let productsInOrder: { product: Product; quantity: number; price: number }[] = [];
        let notEnoughStock: { productId: number; requested: number; available: number, name: string }[] = [];
        let isValid = true;

        req.body.items.forEach((item: { productId: number; quantity: number }) => {
            if (item.quantity <= 0 || !Number.isInteger(item.quantity)) {
                return res.status(422).json({
                    error: { code: 'VALIDATION_ERROR', message: `Invalid quantity for item with ID ${item.productId}` }
                });
            }

            let product = db.select().from(products).where(eq(products.id, item.productId)).get();
            if (!product) {
                isValid = false;
                return
            }
            if (product.amount < item.quantity) {
                notEnoughStock.push({ productId: item.productId, requested: item.quantity, available: product.amount, name: product.name });
            }

            productsInOrder.push({ product: product, quantity: item.quantity, price: product.priceSatang });
        })

        if (!isValid) {
            return res.status(404).json({
                error: { code: 'PRODUCT_NOT_FOUND', message: 'One or more products not found'}
            });
        }

        if (notEnoughStock.length > 0) {
            return res.status(409).json({
                error: { code: 'INSUFFICIENT_STOCK',
                    message: 'Not enough stock for some items',
                    details: notEnoughStock }
            });
        }

        let productPurchases: { productId: number; quantity: number; unitPriceSatang: number, lineTotalSatang: number, name: string }[] = [];
        try{
            db.transaction((tx) => {
                const result = tx.insert(sales).values({
                    totalSatang: totalAmount,
                    createdAt: new Date().toISOString(),
                }).returning({saleId: sales.id, createdAt: sales.createdAt}).get();

                if (!result) {
                    throw new Error('Failed to create sale');
                }

                const saleId = result.saleId;
                const createdAt = result.createdAt;

                productsInOrder.forEach(item => {
                    totalAmount += item.quantity * item.price;
                    productPurchases.push({ productId: item.product.id, quantity: item.quantity, unitPriceSatang: item.price, lineTotalSatang: item.quantity * item.price , name: item.product.name});
                    tx.update(products).set({ amount: sql`${products.amount} - ${item.quantity}` }).where(eq(products.id, item.product.id)).run();
                    const insertResult = tx.insert(saleItems).values({
                        saleId: saleId,
                        productId: item.product.id,
                        name: item.product.name,
                        quantity: item.quantity,
                        unitPriceSatang: item.price,
                        lineTotalSatang: item.quantity * item.price
                    }).run();
                    if (!insertResult) {
                        throw new Error('Failed to insert sale item');
                    }
                });

                let updateSaleResult = tx.update(sales).set({ totalSatang: totalAmount }).where(eq(sales.id, saleId)).run();
                if (!updateSaleResult) {
                    throw new Error('Failed to update sale total');
                }
                return res.status(201).json({
                    sale: {
                        id: saleId,
                        totalSatang: totalAmount,
                        items: productPurchases,
                        createdAt: createdAt
                    }
                });
            });
        }
        catch (error) {
            return res.status(500).json({
                error: { code: 'INTERNAL_ERROR', message: 'An error occurred while processing the checkout' }
            });
        }
    }
);
    return router;
}