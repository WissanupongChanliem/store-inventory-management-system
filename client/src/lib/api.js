// เปลี่ยนเป็น false เมื่อ backend พร้อมใช้งาน
const USE_MOCK = true

export class ApiError extends Error {
    constructor(status, code, message, details = []) {
        super(message)
        this.status = status
        this.code = code
        this.details = details
    }
}

// ---------- ของจริง: เรียก backend ผ่าน proxy ----------
async function request(method, path, body) {
    const res = await fetch(path, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined
    })
    if (res.status === 204) return null

    let json = null
    try {
        json = await res.json()
    } catch {
        // ไม่มี body หรือไม่ใช่ JSON
    }
    if (!res.ok) {
        throw new ApiError(res.status, json?.error?.code, json?.error?.message, json?.error?.details)
    }
    return json
}

const realApi = {
    me: () => request('GET', '/api/auth/me'),
    login: (username, password) => request('POST', '/api/auth/login', { username, password }),
    logout: () => request('POST', '/api/auth/logout'),
    listProducts: ({ search = '', limit = 20, offset = 0 } = {}) => {
        const params = new URLSearchParams({ limit, offset })
        if (search.trim()) params.set('search', search.trim())
        return request('GET', `/api/products?${params}`)
    },
    createProduct: (data) => request('POST', '/api/products', data),
    updateProduct: (id, data) => request('PATCH', `/api/products/${id}`, data),
    deleteProduct: (id) => request('DELETE', `/api/products/${id}`),
    checkout: (items) => request('POST', '/api/checkout', { items })
}

// ---------- ข้อมูลจำลอง: ทำงานในหน่วยความจำ รีเฟรชหน้าแล้วรีเซ็ต ----------
const now = new Date().toISOString()
let loggedIn = true
let nextId = 6
let nextSaleId = 1
let products = [
    { id: 1, name: 'น้ำดื่ม 600 มล.', amount: 120, priceSatang: 700 },
    { id: 2, name: 'Milk 1L', amount: 24, priceSatang: 2500 },
    { id: 3, name: 'มาม่าต้มยำกุ้ง', amount: 0, priceSatang: 800 },
    { id: 4, name: 'ขนมปังแผ่น', amount: 15, priceSatang: 3500 },
    { id: 5, name: 'ไข่ไก่ เบอร์ 2 (แผง)', amount: 40, priceSatang: 11500 }
].map((p) => ({ ...p, createdAt: now, updatedAt: now }))

const wait = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms))
const copy = (value) => JSON.parse(JSON.stringify(value))

function validate(data, partial) {
    const details = []
    const allowed = ['name', 'amount', 'priceSatang']

    for (const key of Object.keys(data)) {
        if (!allowed.includes(key)) details.push({ field: key, message: 'ไม่รู้จัก field นี้' })
    }
    if (partial && Object.keys(data).length === 0) {
        details.push({ field: 'name', message: 'ต้องส่งอย่างน้อยหนึ่ง field' })
    }
    if (!partial || 'name' in data) {
        const name = typeof data.name === 'string' ? data.name.trim() : ''
        if (!name || name.length > 100) {
            details.push({ field: 'name', message: 'ชื่อสินค้าต้องยาว 1–100 ตัวอักษร' })
        }
    }
    if (!partial || 'amount' in data) {
        if (!Number.isInteger(data.amount) || data.amount < 0 || data.amount > 1_000_000) {
            details.push({ field: 'amount', message: 'จำนวนต้องเป็นจำนวนเต็ม 0–1,000,000' })
        }
    }
    if (!partial || 'priceSatang' in data) {
        if (!Number.isInteger(data.priceSatang) || data.priceSatang < 0 || data.priceSatang > 100_000_000) {
            details.push({ field: 'priceSatang', message: 'ราคาต้องเป็นจำนวนเต็ม 0–100,000,000 สตางค์' })
        }
    }
    if (details.length > 0) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'ข้อมูลไม่ถูกต้อง', details)
    }
}

function assertUniqueName(name, exceptId) {
    const lower = name.trim().toLowerCase()
    if (products.some((p) => p.id !== exceptId && p.name.toLowerCase() === lower)) {
        throw new ApiError(409, 'PRODUCT_NAME_EXISTS', 'ชื่อสินค้านี้มีอยู่แล้ว')
    }
}

const mockApi = {
    async me() {
        await wait(100)
        if (!loggedIn) throw new ApiError(401, 'UNAUTHENTICATED', 'ยังไม่ได้เข้าสู่ระบบ')
        return { user: { id: 1, username: 'owner' } }
    },

    async login(username, password) {
        await wait()
        if (!username || !password) {
            throw new ApiError(422, 'VALIDATION_ERROR', 'ข้อมูลไม่ครบ')
        }
        loggedIn = true // โหมดจำลอง: รับทุกชื่อผู้ใช้/รหัสผ่านที่ไม่ว่าง
        return { user: { id: 1, username } }
    },

    async logout() {
        await wait(100)
        loggedIn = false
        return null
    },

    async listProducts({ search = '', limit = 20, offset = 0 } = {}) {
        await wait()
        const q = search.trim().toLowerCase()
        let matches = products
        if (q) {
            const numeric = /^\d+$/.test(q)
            matches = products.filter(
                (p) => p.name.toLowerCase().includes(q) || (numeric && p.id === Number(q))
            )
        }
        const sorted = [...matches].sort((a, b) => {
            const byName = a.name.toLowerCase().localeCompare(b.name.toLowerCase())
            return byName !== 0 ? byName : a.id - b.id
        })
        return {
            items: copy(sorted.slice(offset, offset + limit)),
            total: sorted.length,
            limit,
            offset
        }
    },

    async createProduct(data) {
        await wait()
        validate(data, false)
        assertUniqueName(data.name)
        const stamp = new Date().toISOString()
        const product = {
            id: nextId++,
            name: data.name.trim(),
            amount: data.amount,
            priceSatang: data.priceSatang,
            createdAt: stamp,
            updatedAt: stamp
        }
        products.push(product)
        return { product: copy(product) }
    },

    async updateProduct(id, data) {
        await wait()
        const product = products.find((p) => p.id === id)
        if (!product) throw new ApiError(404, 'PRODUCT_NOT_FOUND', 'ไม่พบสินค้า')
        validate(data, true)
        if ('name' in data) assertUniqueName(data.name, id)
        if ('name' in data) product.name = data.name.trim()
        if ('amount' in data) product.amount = data.amount
        if ('priceSatang' in data) product.priceSatang = data.priceSatang
        product.updatedAt = new Date().toISOString()
        return { product: copy(product) }
    },

    async deleteProduct(id) {
        await wait()
        const index = products.findIndex((p) => p.id === id)
        if (index === -1) throw new ApiError(404, 'PRODUCT_NOT_FOUND', 'ไม่พบสินค้า')
        products.splice(index, 1)
        return null
    },
    async checkout(items) {
        await wait()
        const fail = (field, message) => {
            throw new ApiError(422, 'VALIDATION_ERROR', 'ข้อมูลไม่ถูกต้อง', [{ field, message }])
        }

        if (!Array.isArray(items) || items.length === 0) {
            fail('items', 'ต้องมีสินค้าอย่างน้อยหนึ่งรายการ')
        }

        const seen = new Set()
        items.forEach((item, i) => {
            if (!Number.isInteger(item.productId) || item.productId < 1) {
                fail(`items[${i}].productId`, 'productId ต้องเป็นจำนวนเต็มบวก')
            }
            if (!Number.isInteger(item.quantity) || item.quantity < 1) {
                fail(`items[${i}].quantity`, 'quantity ต้องเป็นจำนวนเต็มบวก')
            }
            if (seen.has(item.productId)) fail('items', 'มี productId ซ้ำ')
            seen.add(item.productId)
        })

        const lines = items.map((item) => {
            const product = products.find((p) => p.id === item.productId)
            if (!product) throw new ApiError(404, 'PRODUCT_NOT_FOUND', 'ไม่พบสินค้า')
            return { product, quantity: item.quantity }
        })

        // ตรวจสต็อกทุกรายการก่อน ถ้าไม่พอจะไม่แก้ข้อมูลใดเลย
        const shortages = lines
            .filter((l) => l.quantity > l.product.amount)
            .map((l) => ({
                productId: l.product.id,
                name: l.product.name,
                requested: l.quantity,
                available: l.product.amount
            }))
        if (shortages.length > 0) {
            throw new ApiError(409, 'INSUFFICIENT_STOCK', 'สินค้าคงเหลือไม่พอ', shortages)
        }

        const stamp = new Date().toISOString()
        const saleItems = lines.map(({ product, quantity }) => {
            product.amount -= quantity
            product.updatedAt = stamp
            return {
                productId: product.id,
                name: product.name,
                unitPriceSatang: product.priceSatang,
                quantity,
                lineTotalSatang: product.priceSatang * quantity
            }
        })

        return {
            sale: {
                id: nextSaleId++,
                items: saleItems,
                totalSatang: saleItems.reduce((sum, i) => sum + i.lineTotalSatang, 0),
                createdAt: stamp
            }
        }
    }
}

export const api = USE_MOCK ? mockApi : realApi