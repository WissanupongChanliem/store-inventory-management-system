<script>
    import { api, ApiError } from "./api.js";

    const PAGE_SIZE = 20;

    let items = $state([]);
    let total = $state(0);
    let search = $state("");
    let offset = $state(0);
    let loading = $state(true);
    let loadError = $state("");

    let formOpen = $state(false);
    let editing = $state(null);
    let form = $state({ name: "", amount: "", price: "" });
    let fieldErrors = $state({});
    let formError = $state("");
    let saving = $state(false);

    let deleting = $state(null);
    let deleteError = $state("");
    let removing = $state(false);

    let requestId = 0;

    async function load(q = search, o = offset) {
        const id = ++requestId;
        loading = true;
        loadError = "";
        try {
            const res = await api.listProducts({
                search: q,
                limit: PAGE_SIZE,
                offset: o,
            });
            if (id !== requestId) return;
            items = res.items;
            total = res.total;
        } catch {
            if (id !== requestId) return;
            loadError = "โหลดรายการสินค้าไม่สำเร็จ";
        } finally {
            if (id === requestId) loading = false;
        }
    }

    // โหลดใหม่เมื่อคำค้นหรือหน้าเปลี่ยน (หน่วง 300 ms ระหว่างพิมพ์)
    $effect(() => {
        const q = search;
        const o = offset;
        const timer = setTimeout(() => load(q, o), 300);
        return () => clearTimeout(timer);
    });

    function formatPrice(satang) {
        return (satang / 100).toLocaleString("th-TH", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
    }

    function parsePrice(text) {
        const t = String(text).trim();
        if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
        return Math.round(parseFloat(t) * 100);
    }

    function openCreate() {
        editing = null;
        form = { name: "", amount: "", price: "" };
        fieldErrors = {};
        formError = "";
        formOpen = true;
    }

    function openEdit(product) {
        editing = product;
        form = {
            name: product.name,
            amount: String(product.amount),
            price: (product.priceSatang / 100).toFixed(2),
        };
        fieldErrors = {};
        formError = "";
        formOpen = true;
    }

    function closeForm() {
        formOpen = false;
        editing = null;
    }

    function handleSaveError(e) {
        if (e instanceof ApiError) {
            if (e.code === "PRODUCT_NAME_EXISTS") {
                fieldErrors = { name: "ชื่อสินค้านี้มีอยู่แล้ว" };
                return;
            }
            if (e.code === "VALIDATION_ERROR") {
                const map = {};
                for (const d of e.details) {
                    map[d.field === "priceSatang" ? "price" : d.field] =
                        d.message;
                }
                fieldErrors = map;
                return;
            }
            if (e.code === "PRODUCT_NOT_FOUND") {
                formError = "ไม่พบสินค้านี้แล้ว (อาจถูกลบไปก่อนหน้า)";
                return;
            }
        }
        formError = "บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง";
    }

    async function submit(event) {
        event.preventDefault();
        formError = "";

        const name = form.name.trim();
        const amountText = String(form.amount).trim();
        const priceSatang = parsePrice(form.price);

        const errors = {};
        if (!name || name.length > 100) {
            errors.name = "ชื่อสินค้าต้องยาว 1–100 ตัวอักษร";
        }
        if (!/^\d+$/.test(amountText) || Number(amountText) > 1_000_000) {
            errors.amount = "จำนวนต้องเป็นจำนวนเต็ม 0–1,000,000";
        }
        if (priceSatang === null || priceSatang > 100_000_000) {
            errors.price =
                "ราคาต้องอยู่ระหว่าง 0–1,000,000 บาท (ทศนิยมไม่เกิน 2 ตำแหน่ง)";
        }
        fieldErrors = errors;
        if (Object.keys(errors).length > 0) return;

        const data = { name, amount: Number(amountText), priceSatang };

        saving = true;
        try {
            if (editing) {
                // ส่งเฉพาะ field ที่เปลี่ยน (PATCH ที่ body ว่างจะถูกปฏิเสธ)
                const changes = {};
                if (data.name !== editing.name) changes.name = data.name;
                if (data.amount !== editing.amount)
                    changes.amount = data.amount;
                if (data.priceSatang !== editing.priceSatang)
                    changes.priceSatang = data.priceSatang;
                if (Object.keys(changes).length > 0) {
                    await api.updateProduct(editing.id, changes);
                }
            } else {
                await api.createProduct(data);
            }
            closeForm();
            await load();
        } catch (e) {
            handleSaveError(e);
        } finally {
            saving = false;
        }
    }

    function askDelete(product) {
        deleting = product;
        deleteError = "";
    }

    async function confirmDelete() {
        removing = true;
        deleteError = "";
        try {
            await api.deleteProduct(deleting.id);
        } catch (e) {
            // 404 แปลว่าถูกลบไปแล้ว ถือว่าสำเร็จ
            if (!(e instanceof ApiError && e.code === "PRODUCT_NOT_FOUND")) {
                deleteError = "ลบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง";
                removing = false;
                return;
            }
        }
        removing = false;
        deleting = null;

        if (items.length === 1 && offset > 0) {
            offset = Math.max(0, offset - PAGE_SIZE); // ลบรายการสุดท้ายของหน้า ถอยกลับหนึ่งหน้า
        } else {
            await load();
        }
    }

    const pageStart = $derived(total === 0 ? 0 : offset + 1);
    const pageEnd = $derived(Math.min(offset + PAGE_SIZE, total));
</script>

<section class="products">
    <div class="toolbar">
        <h2>รายการสินค้า</h2>
        <button type="button" class="primary" onclick={openCreate}
            >+ เพิ่มสินค้า</button
        >
    </div>

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

    <div class="table-wrap">
        <table>
            <thead>
                <tr>
                    <th>ID</th>
                    <th>ชื่อสินค้า</th>
                    <th class="num">คงเหลือ</th>
                    <th class="num">ราคา (บาท)</th>
                    <th class="actions">จัดการ</th>
                </tr>
            </thead>
            <tbody>
                {#each items as product (product.id)}
                    <tr>
                        <td>{product.id}</td>
                        <td>{product.name}</td>
                        <td class="num" class:out={product.amount === 0}>
                            {product.amount === 0
                                ? "หมด"
                                : product.amount.toLocaleString("th-TH")}
                        </td>
                        <td class="num">{formatPrice(product.priceSatang)}</td>
                        <td class="actions">
                            <button
                                type="button"
                                class="link"
                                title="แก้ไข"
                                aria-label={`แก้ไข ${product.name}`}
                                onclick={() => openEdit(product)}
                            >
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
                                    <path
                                        d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"
                                    />
                                    <path d="m15 5 4 4" />
                                </svg>
                            </button>
                            <button
                                type="button"
                                class="link danger"
                                title="ลบ"
                                aria-label={`ลบ ${product.name}`}
                                onclick={() => askDelete(product)}
                            >
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
                                    <path d="M3 6h18" />
                                    <path
                                        d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"
                                    />
                                    <path
                                        d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"
                                    />
                                    <line x1="10" x2="10" y1="11" y2="17" />
                                    <line x1="14" x2="14" y1="11" y2="17" />
                                </svg>
                            </button>
                        </td>
                    </tr>
                {:else}
                    {#if !loading}
                        <tr>
                            <td colspan="5" class="empty">
                                {search.trim()
                                    ? "ไม่พบสินค้าที่ค้นหา"
                                    : 'ยังไม่มีสินค้า กด "เพิ่มสินค้า" เพื่อเริ่มต้น'}
                            </td>
                        </tr>
                    {/if}
                {/each}
                {#if loading}
                    <tr>
                        <td colspan="5" class="empty">กำลังโหลด...</td>
                    </tr>
                {/if}
            </tbody>
        </table>
    </div>

    <div class="pager">
        <span>แสดง {pageStart}–{pageEnd} จาก {total} รายการ</span>
        <div>
            <button
                type="button"
                class="secondary"
                disabled={offset === 0 || loading}
                onclick={() => (offset = Math.max(0, offset - PAGE_SIZE))}
            >
                ก่อนหน้า
            </button>
            <button
                type="button"
                class="secondary"
                disabled={offset + PAGE_SIZE >= total || loading}
                onclick={() => (offset = offset + PAGE_SIZE)}
            >
                ถัดไป
            </button>
        </div>
    </div>
</section>

{#if formOpen}
    <div class="backdrop">
        <div
            class="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="form-title"
        >
            <h3 id="form-title">{editing ? "แก้ไขสินค้า" : "เพิ่มสินค้า"}</h3>

            <form onsubmit={submit} novalidate>
                <label for="p-name">ชื่อสินค้า</label>
                <input id="p-name" type="text" bind:value={form.name} />
                {#if fieldErrors.name}<p class="field-error">
                        {fieldErrors.name}
                    </p>{/if}

                <label for="p-amount">จำนวนคงเหลือ</label>
                <input
                    id="p-amount"
                    type="text"
                    inputmode="numeric"
                    bind:value={form.amount}
                />
                {#if fieldErrors.amount}<p class="field-error">
                        {fieldErrors.amount}
                    </p>{/if}

                <label for="p-price">ราคา (บาท)</label>
                <input
                    id="p-price"
                    type="text"
                    inputmode="decimal"
                    placeholder="เช่น 25 หรือ 25.50"
                    bind:value={form.price}
                />
                {#if fieldErrors.price}<p class="field-error">
                        {fieldErrors.price}
                    </p>{/if}

                {#if formError}<p class="error" role="alert">
                        {formError}
                    </p>{/if}

                <div class="modal-actions">
                    <button
                        type="button"
                        class="secondary"
                        onclick={closeForm}
                        disabled={saving}>ยกเลิก</button
                    >
                    <button type="submit" class="primary" disabled={saving}>
                        {saving ? "กำลังบันทึก..." : "บันทึก"}
                    </button>
                </div>
            </form>
        </div>
    </div>
{/if}

{#if deleting}
    <div class="backdrop">
        <div
            class="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-title"
        >
            <h3 id="delete-title">ยืนยันการลบสินค้า</h3>
            <p>
                ต้องการลบ <strong>{deleting.name}</strong> ถาวรหรือไม่? ประวัติการขายเดิมจะยังอยู่
            </p>
            {#if deleteError}<p class="error" role="alert">
                    {deleteError}
                </p>{/if}
            <div class="modal-actions">
                <button
                    type="button"
                    class="secondary"
                    onclick={() => (deleting = null)}
                    disabled={removing}>ยกเลิก</button
                >
                <button
                    type="button"
                    class="primary danger-bg"
                    onclick={confirmDelete}
                    disabled={removing}
                >
                    {removing ? "กำลังลบ..." : "ลบสินค้า"}
                </button>
            </div>
        </div>
    </div>
{/if}

<style>
    .products {
        max-width: 960px;
        margin: 0 auto;
        padding: 24px 16px 48px;
    }

    .toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 16px;
    }

    h2 {
        margin: 0;
        font-size: 1.8rem;
        color: #17634e;
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

    .table-wrap {
        overflow-x: auto;
        background: #ffffff;
        border: 1px solid #e1e5e2;
        border-radius: 10px;
    }

    table {
        width: 100%;
        border-collapse: collapse;
    }

    th,
    td {
        padding: 14px 16px;
        text-align: left;
        border-bottom: 1px solid #edf0ee;
    }

    th {
        font-size: 0.95rem;
        color: #555;
        background: #fafbfa;
    }

    tbody tr:last-child td {
        border-bottom: none;
    }

    .num {
        text-align: right;
    }

    .out {
        color: #b3261e;
        font-weight: 600;
    }

    .actions {
        text-align: right;
        white-space: nowrap;
    }

    .empty {
        padding: 32px;
        text-align: center;
        color: #777;
    }

    .pager {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-top: 16px;
        color: #555;
    }

    .pager div {
        display: flex;
        gap: 8px;
    }

    button {
        font: inherit;
        cursor: pointer;
    }

    button:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }

    .primary {
        padding: 12px 20px;
        font-weight: 600;
        color: #ffffff;
        background: #17634e;
        border: none;
        border-radius: 10px;
    }

    .primary:hover:not(:disabled) {
        background: #124f3e;
    }

    .danger-bg {
        background: #b3261e;
    }

    .danger-bg:hover:not(:disabled) {
        background: #8f1e18;
    }

    .secondary {
        padding: 10px 16px;
        color: #17634e;
        background: #ffffff;
        border: 1px solid #17634e;
        border-radius: 10px;
    }

    .link {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 8px;
        color: #17634e;
        background: transparent;
        border: none;
        border-radius: 8px;
    }

    .link:hover {
        background: #eaf3eb;
    }

    .link.danger {
        color: #b3261e;
    }

    .link.danger:hover {
        background: #fdecea;
    }

    .error {
        margin: 0 0 12px;
        color: #b3261e;
    }

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
        margin: 0 0 16px;
        color: #17634e;
    }

    .modal form {
        display: flex;
        flex-direction: column;
    }

    .modal label {
        margin-bottom: 6px;
        font-weight: 600;
    }

    .modal input {
        margin-bottom: 4px;
        padding: 12px 14px;
        font-size: 1rem;
        border: 1px solid #c9cfcc;
        border-radius: 8px;
    }

    .field-error {
        margin: 0 0 8px;
        font-size: 0.9rem;
        color: #b3261e;
    }

    .modal label:not(:first-child) {
        margin-top: 12px;
    }

    .modal-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        margin-top: 20px;
    }
</style>
