<script>
    import { api, ApiError } from "./api.js";

    const LIMIT = 200; // ค่าสูงสุดที่ GET /api/products รับได้

    let products = $state([]);
    let productTotal = $state(0);
    let search = $state("");
    let loading = $state(true);
    let loadError = $state("");

    let cart = $state([]);
    let submitting = $state(false);
    let saleError = $state("");
    let shortages = $state([]);
    let receipt = $state(null);

    let requestId = 0;

    async function load(q = search) {
        const id = ++requestId;
        loading = true;
        loadError = "";
        try {
            const res = await api.listProducts({
                search: q,
                limit: LIMIT,
                offset: 0,
            });
            if (id !== requestId) return;
            products = res.items;
            productTotal = res.total;
        } catch {
            if (id !== requestId) return;
            loadError = "โหลดรายการสินค้าไม่สำเร็จ";
        } finally {
            if (id === requestId) loading = false;
        }
    }

    $effect(() => {
        const q = search;
        const timer = setTimeout(() => load(q), 300);
        return () => clearTimeout(timer);
    });

    const qtyById = $derived(
        Object.fromEntries(cart.map((l) => [l.id, l.quantity])),
    );
    const cartTotal = $derived(
        cart.reduce((sum, l) => sum + l.priceSatang * l.quantity, 0),
    );
    const cartCount = $derived(cart.reduce((sum, l) => sum + l.quantity, 0));

    function baht(satang) {
        return (
            "฿" +
            (satang / 100).toLocaleString("th-TH", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
            })
        );
    }

    function clearErrors() {
        saleError = "";
        shortages = [];
    }

    function canAdd(product) {
        return (
            product.amount > 0 && (qtyById[product.id] ?? 0) < product.amount
        );
    }

    function addToCart(product) {
        if (!canAdd(product)) return;
        clearErrors();
        const line = cart.find((l) => l.id === product.id);
        if (line) {
            line.quantity += 1;
            line.amount = product.amount;
            line.priceSatang = product.priceSatang;
        } else {
            cart.push({
                id: product.id,
                name: product.name,
                priceSatang: product.priceSatang,
                amount: product.amount,
                quantity: 1,
            });
        }
    }

    function removeLine(id) {
        cart = cart.filter((l) => l.id !== id);
        clearErrors();
    }

    function changeQuantity(line, delta) {
        const next = line.quantity + delta;
        if (next < 1) {
            removeLine(line.id);
            return;
        }
        if (next > line.amount) return;
        line.quantity = next;
        clearErrors();
    }

    function clearCart() {
        cart = [];
        clearErrors();
    }

    async function confirmSale() {
        if (cart.length === 0 || submitting) return;
        clearErrors();
        submitting = true;

        try {
            // ส่งเฉพาะ productId กับ quantity ตาม spec; ราคาและยอดรวมให้ server คำนวณเอง
            const res = await api.checkout(
                cart.map((l) => ({ productId: l.id, quantity: l.quantity })),
            );
            receipt = res.sale;
            cart = [];
            await load();
        } catch (e) {
            if (e instanceof ApiError && e.code === "INSUFFICIENT_STOCK") {
                shortages = e.details;
                const next = [];
                for (const line of cart) {
                    const s = e.details.find((d) => d.productId === line.id);
                    if (!s) {
                        next.push(line);
                    } else if (s.available > 0) {
                        next.push({
                            ...line,
                            amount: s.available,
                            quantity: Math.min(line.quantity, s.available),
                        });
                    }
                }
                cart = next;
                saleError =
                    "สินค้าคงเหลือไม่พอ ระบบปรับจำนวนในตะกร้าให้แล้ว กรุณาตรวจสอบอีกครั้ง";
                await load();
            } else if (
                e instanceof ApiError &&
                e.code === "PRODUCT_NOT_FOUND"
            ) {
                saleError =
                    "ไม่พบสินค้าบางรายการในระบบ (อาจถูกลบไปแล้ว) กรุณาล้างตะกร้าแล้วเลือกใหม่";
                await load();
            } else if (e instanceof ApiError && e.status === 422) {
                saleError =
                    "ข้อมูลในตะกร้าไม่ถูกต้อง กรุณาล้างตะกร้าแล้วเลือกใหม่";
            } else {
                saleError = "บันทึกการขายไม่สำเร็จ กรุณาลองใหม่อีกครั้ง";
            }
        } finally {
            submitting = false;
        }
    }

    function formatDate(iso) {
        return new Date(iso).toLocaleString("th-TH", {
            dateStyle: "medium",
            timeStyle: "short",
        });
    }
</script>

<div class="checkout">
    <section class="left">
        <h2>ขายสินค้า</h2>
        <br>

        <div class="search-box">
            <svg
                viewBox="0 0 24 24"
                width="20"
                height="20"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
            >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
            </svg>
            <input
                type="search"
                placeholder="ค้นหาด้วยชื่อสินค้าหรือ ID"
                aria-label="ค้นหาสินค้า"
                bind:value={search}
            />
        </div>

        {#if loadError}
            <p class="error" role="alert">{loadError}</p>
        {/if}

        {#if loading && products.length === 0}
            <p class="hint">กำลังโหลด...</p>
        {:else if products.length === 0}
            <p class="hint">
                {search.trim() ? "ไม่พบสินค้าที่ค้นหา" : "ยังไม่มีสินค้า"}
            </p>
        {:else}
            <div class="grid">
                {#each products as product (product.id)}
                    <div class="card" class:soldout={product.amount === 0}>
                        <div class="meta">
                            #{product.id} · {product.amount === 0
                                ? "สินค้าหมด"
                                : `คงเหลือ ${product.amount.toLocaleString("th-TH")} ชิ้น`}
                        </div>
                        <div class="name">{product.name}</div>
                        <div class="bottom">
                            <span class="price"
                                >{baht(product.priceSatang)}</span
                            >
                            <button
                                type="button"
                                class="add"
                                disabled={!canAdd(product)}
                                aria-label={`เพิ่ม ${product.name} ลงตะกร้า`}
                                onclick={() => addToCart(product)}
                            >
                                <svg
                                    viewBox="0 0 24 24"
                                    width="22"
                                    height="22"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    aria-hidden="true"
                                >
                                    <path d="M5 12h14" />
                                    <path d="M12 5v14" />
                                </svg>
                            </button>
                        </div>
                    </div>
                {/each}
            </div>

            {#if productTotal > LIMIT}
                <p class="hint">
                    แสดง {LIMIT} จาก {productTotal} รายการ ใช้ช่องค้นหาเพื่อหาสินค้าอื่น
                </p>
            {/if}
        {/if}
    </section>

    <aside class="cart" aria-label="ตะกร้าสินค้า">
        <div class="cart-head">
            <h3>ตะกร้าสินค้า</h3>
            {#if cart.length > 0}
                <button type="button" class="clear" onclick={clearCart}
                    >ล้างทั้งหมด</button
                >
            {/if}
        </div>

        {#if cart.length === 0}
            <p class="hint empty-cart">ยังไม่มีสินค้าในตะกร้า</p>
        {:else}
            <ul class="lines">
                {#each cart as line (line.id)}
                    <li class="line">
                        <div>
                            <div class="line-name">{line.name}</div>
                            <div class="line-unit">
                                {baht(line.priceSatang)} / ชิ้น
                            </div>
                        </div>
                        <button
                            type="button"
                            class="remove"
                            title="นำออกจากตะกร้า"
                            aria-label={`นำ ${line.name} ออกจากตะกร้า`}
                            onclick={() => removeLine(line.id)}
                        >
                            <svg
                                viewBox="0 0 24 24"
                                width="18"
                                height="18"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                aria-hidden="true"
                            >
                                <path d="M3 6h18" />
                                <path
                                    d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"
                                />
                                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                                <line x1="10" x2="10" y1="11" y2="17" />
                                <line x1="14" x2="14" y1="11" y2="17" />
                            </svg>
                        </button>

                        <div class="stepper">
                            <button
                                type="button"
                                aria-label="ลดจำนวน"
                                onclick={() => changeQuantity(line, -1)}
                                >−</button
                            >
                            <span>{line.quantity}</span>
                            <button
                                type="button"
                                aria-label="เพิ่มจำนวน"
                                disabled={line.quantity >= line.amount}
                                onclick={() => changeQuantity(line, 1)}
                            >
                                +
                            </button>
                        </div>
                        <div class="line-total">
                            {baht(line.priceSatang * line.quantity)}
                        </div>
                    </li>
                {/each}
            </ul>
        {/if}

        <div class="total">
            <span>ยอดรวม ({cartCount} ชิ้น)</span>
            <strong>{baht(cartTotal)}</strong>
        </div>

        {#if saleError}
            <div class="sale-error" role="alert">
                <p>{saleError}</p>
                {#if shortages.length > 0}
                    <ul>
                        {#each shortages as s (s.productId)}
                            <li>
                                {s.name}: ต้องการ {s.requested} ชิ้น คงเหลือ {s.available}
                                ชิ้น
                            </li>
                        {/each}
                    </ul>
                {/if}
            </div>
        {/if}

        <button
            type="button"
            class="confirm"
            disabled={cart.length === 0 || submitting}
            onclick={confirmSale}
        >
            {submitting ? "กำลังบันทึก..." : "ยืนยันการขาย"}
        </button>
    </aside>
</div>

{#if receipt}
    <div class="backdrop">
        <div
            class="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="receipt-title"
        >
            <h3 id="receipt-title">ขายสำเร็จ</h3>
            <p class="receipt-meta">
                บิลเลขที่ #{receipt.id} · {formatDate(receipt.createdAt)}
            </p>

            <ul class="receipt-lines">
                {#each receipt.items as item (item.productId)}
                    <li>
                        <span>{item.name} × {item.quantity}</span>
                        <span>{baht(item.lineTotalSatang)}</span>
                    </li>
                {/each}
            </ul>

            <div class="total">
                <span>ยอดรวม</span>
                <strong>{baht(receipt.totalSatang)}</strong>
            </div>

            <button
                type="button"
                class="confirm"
                onclick={() => (receipt = null)}>ปิด</button
            >
        </div>
    </div>
{/if}

<style>
    .checkout {
        max-width: 1280px;
        margin: 0 auto;
        padding: 24px 16px 48px;
        display: grid;
        grid-template-columns: minmax(0, 1fr) 340px;
        gap: 24px;
        align-items: start;
    }

    h2 {
        margin: 0;
        font-size: 1.8rem;
        color: #17634e;
    }

    .subtitle {
        margin: 4px 0 20px;
        font-size: 0.95rem;
        color: #6b7974;
    }

    .search-box {
        position: relative;
        margin-bottom: 20px;
    }

    .search-box svg {
        position: absolute;
        top: 50%;
        left: 16px;
        transform: translateY(-50%);
        color: #6b7974;
        pointer-events: none;
    }

    .search-box input {
        width: 100%;
        box-sizing: border-box;
        padding: 14px 16px 14px 46px;
        font-size: 1.05rem;
        background: #ffffff;
        border: 1px solid #c9cfcc;
        border-radius: 10px;
    }

    .search-box input::placeholder {
        color: #6b7974;
    }

    .search-box input:focus {
        outline: 2px solid #17634e;
        border-color: #17634e;
    }

    .hint {
        color: #6b7974;
    }

    .error {
        color: #b3261e;
    }

    /* ---------- การ์ดสินค้า ---------- */
    .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
        gap: 16px;
    }

    .card {
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        gap: 8px;
        min-height: 112px;
        padding: 14px 16px;
        background: #ffffff;
        border: 1px solid #e1e5e2;
        border-radius: 12px;
    }

    .meta {
        font-size: 0.8rem;
        color: #6b7974;
    }

    .name {
        font-size: 1.05rem;
        font-weight: 600;
        color: #222222;
    }

    .bottom {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
    }

    .price {
        font-size: 1.3rem;
        font-weight: 700;
        color: #17634e;
    }

    .add {
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #17634e;
        background: #eaf3eb;
        border: none;
        border-radius: 8px;
        cursor: pointer;
    }

    .add:hover:not(:disabled) {
        background: #d6e8d9;
    }

    .add:disabled {
        cursor: not-allowed;
        opacity: 0.5;
    }

    .card.soldout {
        background: #eff1ee;
    }

    .card.soldout .meta,
    .card.soldout .name,
    .card.soldout .price {
        color: #9aa5a0;
    }

    .card.soldout .add {
        color: #9aa5a0;
        background: #e3e7e4;
        opacity: 1;
    }

    /* ---------- ตะกร้า ---------- */
    .cart {
        position: sticky;
        top: 88px;
        padding: 20px;
        background: #ffffff;
        border: 1px solid #e1e5e2;
        border-radius: 12px;
    }

    .cart-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 8px;
    }

    .cart h3 {
        margin: 0;
        font-size: 1.2rem;
        color: #17634e;
    }

    .clear {
        padding: 0;
        font: inherit;
        font-size: 0.9rem;
        color: #6b7974;
        text-decoration: underline;
        background: none;
        border: none;
        cursor: pointer;
    }

    .empty-cart {
        margin: 16px 0;
        text-align: center;
    }

    .lines {
        max-height: 45vh;
        margin: 0;
        padding: 0;
        overflow-y: auto;
        list-style: none;
    }

    .line {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 8px;
        align-items: center;
        padding: 12px 0;
        border-bottom: 1px solid #edf0ee;
    }

    .line-name {
        font-weight: 600;
        color: #222222;
    }

    .line-unit {
        font-size: 0.85rem;
        color: #6b7974;
    }

    .remove {
        display: flex;
        padding: 6px;
        color: #b3261e;
        background: transparent;
        border: none;
        border-radius: 6px;
        cursor: pointer;
    }

    .remove:hover {
        background: #fdecea;
    }

    .stepper {
        display: flex;
        align-items: center;
        gap: 10px;
    }

    .stepper button {
        width: 30px;
        height: 30px;
        font: inherit;
        font-size: 1.1rem;
        line-height: 1;
        color: #17634e;
        background: #ffffff;
        border: 1px solid #c9cfcc;
        border-radius: 8px;
        cursor: pointer;
    }

    .stepper button:hover:not(:disabled) {
        background: #eaf3eb;
    }

    .stepper button:disabled {
        opacity: 0.4;
        cursor: not-allowed;
    }

    .stepper span {
        min-width: 24px;
        text-align: center;
        font-weight: 600;
    }

    .line-total {
        font-weight: 600;
        text-align: right;
    }

    .total {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        margin: 16px 0;
    }

    .total strong {
        font-size: 1.5rem;
        color: #17634e;
    }
    .total span {
        font-weight: 700;
        color: #222222;
    }

    .sale-error {
        margin-bottom: 12px;
        font-size: 0.9rem;
        color: #b3261e;
    }

    .sale-error p {
        margin: 0 0 6px;
    }

    .sale-error ul {
        margin: 0;
        padding-left: 18px;
    }

    .confirm {
        width: 100%;
        padding: 14px;
        font: inherit;
        font-size: 1.05rem;
        font-weight: 600;
        color: #ffffff;
        background: #17634e;
        border: none;
        border-radius: 10px;
        cursor: pointer;
    }

    .confirm:hover:not(:disabled) {
        background: #124f3e;
    }

    .confirm:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    /* ---------- ใบเสร็จ ---------- */
    .backdrop {
        position: fixed;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
        background: rgba(0, 0, 0, 0.4);
    }

    .modal {
        width: 100%;
        max-width: 440px;
        padding: 24px;
        background: #ffffff;
        border-radius: 12px;
    }

    .modal h3 {
        margin: 0 0 4px;
        color: #17634e;
    }

    .receipt-meta {
        margin: 0 0 16px;
        font-size: 0.9rem;
        color: #6b7974;
    }

    .receipt-lines {
        margin: 0;
        padding: 0;
        list-style: none;
    }

    .receipt-lines li {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        padding: 8px 0;
        border-bottom: 1px solid #edf0ee;
    }

    @media (max-width: 960px) {
        .checkout {
            grid-template-columns: 1fr;
        }

        .cart {
            position: static;
        }
    }
</style>
