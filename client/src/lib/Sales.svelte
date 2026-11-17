<script>
    import { api, ApiError } from "./api.js";

    // อ่านวันที่จาก URL (/sales?date=YYYY-MM-DD) ถ้าไม่มีให้ server ใช้ "วันนี้" ตามเขตเวลาร้าน
    const urlDate = new URLSearchParams(location.search).get("date");

    let selectedDate = $state(urlDate);
    let data = $state(null);
    let selectedId = $state(null);
    let loading = $state(true);
    let error = $state("");
    let requestId = 0;

    async function load(day) {
        const id = ++requestId;
        loading = true;
        error = "";
        try {
            const res = await api.listSales(day ? { date: day } : {});
            if (id !== requestId) return;
            data = res;
            selectedId = res.items[0]?.id ?? null; // เลือกบิลล่าสุดของวันเป็นค่าเริ่มต้น
            history.replaceState({}, "", `/sales?date=${res.date}`);
        } catch (e) {
            if (id !== requestId) return;
            error =
                e instanceof ApiError && e.status === 400
                    ? "รูปแบบวันที่ไม่ถูกต้อง"
                    : "โหลดยอดขายไม่สำเร็จ";
        } finally {
            if (id === requestId) loading = false;
        }
    }

    $effect(() => {
        const day = selectedDate;
        load(day);
    });

    const selected = $derived(
        data?.items.find((s) => s.id === selectedId) ?? null,
    );
    const maxDate = $derived(
        data
            ? new Date().toLocaleDateString("en-CA", {
                  timeZone: data.timezone,
              })
            : undefined,
    );

    const SORT_OPTIONS = [
        { value: "newest", label: "เรียงจากใหม่ไปเก่า" },
        { value: "oldest", label: "เรียงจากเก่าไปใหม่" },
        { value: "highest", label: "เรียงตามยอดรวมมากไปน้อย" },
        { value: "lowest", label: "เรียงตามยอดรวมน้อยไปมาก" },
    ];
    let sortBy = $state("newest");

    // เรียงเฉพาะการแสดงผล (ไม่แก้ data.items) ถ้าค่าเท่ากันให้บิลใหม่กว่าอยู่ก่อน
    const sortedItems = $derived.by(() => {
        const newestFirst = (a, b) =>
            Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id - a.id;
        const compare = {
            newest: newestFirst,
            oldest: (a, b) => newestFirst(b, a),
            highest: (a, b) =>
                b.totalSatang - a.totalSatang || newestFirst(a, b),
            lowest: (a, b) =>
                a.totalSatang - b.totalSatang || newestFirst(a, b),
        }[sortBy];
        return [...(data?.items ?? [])].sort(compare);
    });

    function baht(satang) {
        return (
            "฿" +
            (satang / 100).toLocaleString("th-TH", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
            })
        );
    }

    function dateText(day, month) {
        return new Date(`${day}T12:00:00Z`).toLocaleDateString("th-TH", {
            day: "numeric",
            month,
            year: "numeric",
            timeZone: "UTC",
        });
    }

    function timeOf(iso) {
        return new Date(iso).toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: data.timezone,
        });
    }

    function billNo(id) {
        return `#S-${String(id).padStart(3, "0")}`;
    }

    function pieces(sale) {
        return sale.items.reduce((sum, i) => sum + i.quantity, 0);
    }

    function openPicker(event) {
        try {
            event.currentTarget.showPicker?.();
        } catch {
            // เบราว์เซอร์ไม่รองรับ ใช้การพิมพ์วันที่ในช่องแทน
        }
    }

    function onDateChange(event) {
        const value = event.currentTarget.value;
        if (value) selectedDate = value;
    }
</script>

<div class="sales">
    <header class="head">
        <div>
            <h2>ยอดขายรายวัน</h2>
            <p class="subtitle">ตรวจสอบยอดขายและรายละเอียดแต่ละบิลของวัน</p>
        </div>

        <div class="date-picker">
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
                <rect width="18" height="18" x="3" y="4" rx="2" />
                <path d="M16 2v4" />
                <path d="M8 2v4" />
                <path d="M3 10h18" />
            </svg>
            <span class="date-text"
                >{data ? dateText(data.date, "long") : "เลือกวันที่"}</span
            >
            <svg
                class="chevron"
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
                <path d="m6 9 6 6 6-6" />
            </svg>
            <input
                class="date-input"
                type="date"
                aria-label="เลือกวันที่"
                value={data?.date ?? ""}
                max={maxDate}
                onclick={openPicker}
                onchange={onDateChange}
            />
        </div>
    </header>

    {#if error}
        <div class="error" role="alert">
            <span>{error}</span>
            <button type="button" onclick={() => load(selectedDate)}
                >ลองใหม่</button
            >
        </div>
    {/if}

    {#if data}
        <div class:dim={loading}>
            <section class="summary">
                <div class="card total-card">
                    <div class="label">ยอดขายรวม</div>
                    <div class="big">
                        <strong>{baht(data.summary.totalSatang)}</strong>
                        <span>บาท</span>
                    </div>
                </div>

                <div class="card count-card">
                    <div class="label">จำนวนบิล</div>
                    <div class="count-row">
                        <div class="big dark">
                            <strong>{data.summary.saleCount}</strong>
                            <span>บิล</span>
                        </div>
                        <span class="tz"
                            >{dateText(data.date, "short")} · เวลาในร้าน ({data.timezone})</span
                        >
                    </div>
                </div>
            </section>

            <section class="lower">
                <div class="list">
                    <div class="list-head">
                        <h3>รายการขาย</h3>
                        <div class="sort">
                            <select
                                aria-label="เรียงรายการขาย"
                                bind:value={sortBy}
                            >
                                {#each SORT_OPTIONS as option (option.value)}
                                    <option value={option.value}
                                        >{option.label}</option
                                    >
                                {/each}
                            </select>
                            <svg
                                class="chevron"
                                viewBox="0 0 24 24"
                                width="16"
                                height="16"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                aria-hidden="true"
                            >
                                <path d="m6 9 6 6 6-6" />
                            </svg>
                        </div>
                    </div>

                    <div class="table">
                        <div class="row header">
                            <span>เลขที่บิล</span>
                            <span>เวลา</span>
                            <span>จำนวนชิ้น</span>
                            <span>ยอดรวม</span>
                            <span></span>
                        </div>

                        {#each sortedItems as sale (sale.id)}
                            <button
                                type="button"
                                class="row item"
                                class:active={sale.id === selectedId}
                                aria-pressed={sale.id === selectedId}
                                onclick={() => (selectedId = sale.id)}
                            >
                                <span class="bill">{billNo(sale.id)}</span>
                                <span>{timeOf(sale.createdAt)}</span>
                                <span>{pieces(sale)}</span>
                                <span class="amount"
                                    >{baht(sale.totalSatang)}</span
                                >
                                <svg
                                    class="go"
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
                                    <path d="m9 18 6-6-6-6" />
                                </svg>
                            </button>
                        {:else}
                            <p class="empty">ไม่มีรายการขายในวันนี้</p>
                        {/each}
                    </div>

                    <p class="foot">
                        {data.summary.saleCount} บิล · ข้อมูลเฉพาะวันที่เลือก
                    </p>
                </div>

                <aside class="detail" aria-label="รายละเอียดบิล">
                    {#if selected}
                        <div class="detail-head">
                            <h3>รายละเอียดบิล</h3>
                            <span class="badge">{billNo(selected.id)}</span>
                        </div>
                        <p class="detail-date">
                            {dateText(data.date, "short")} · {timeOf(
                                selected.createdAt,
                            )} น.
                        </p>

                        <div class="divider"></div>

                        <div class="items-row items-head">
                            <span>สินค้า / ราคาต่อชิ้น</span>
                            <span class="c">จำนวน</span>
                            <span class="r">รวม</span>
                        </div>

                        <ul class="items">
                            {#each selected.items as item (item.productId)}
                                <li class="items-row">
                                    <div>
                                        <div class="item-name">{item.name}</div>
                                        <div class="item-unit">
                                            {baht(item.unitPriceSatang)}
                                        </div>
                                    </div>
                                    <span class="c">{item.quantity}</span>
                                    <span class="r line"
                                        >{baht(item.lineTotalSatang)}</span
                                    >
                                </li>
                            {/each}
                        </ul>

                        <div class="divider"></div>

                        <div class="detail-total">
                            <span>ยอดรวม</span>
                            <strong>{baht(selected.totalSatang)}</strong>
                        </div>
                    {:else}
                        <p class="hint">ไม่มีบิลให้แสดงในวันนี้</p>
                    {/if}
                </aside>
            </section>
        </div>
    {:else if loading}
        <p class="hint">กำลังโหลด...</p>
    {/if}
</div>

<style>
    .sales {
        max-width: 1200px;
        margin: 0 auto;
        padding: 24px 16px 48px;
    }

    .head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 24px;
    }

    h2 {
        margin: 0;
        font-size: 1.8rem;
        color: #17634e;
    }

    .subtitle {
        margin: 4px 0 0;
        font-size: 0.95rem;
        color: #6b7974;
    }

    .hint {
        color: #6b7974;
    }

    .dim {
        opacity: 0.6;
        transition: opacity 0.15s;
    }

    .error {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 16px;
        padding: 12px 16px;
        color: #b3261e;
        background: #fdecea;
        border-radius: 10px;
    }

    .error button {
        font: inherit;
        color: #b3261e;
        background: transparent;
        border: 1px solid #b3261e;
        border-radius: 8px;
        padding: 6px 12px;
        cursor: pointer;
    }

    /* ---------- ตัวเลือกวัน ---------- */
    .date-picker {
        position: relative;
        display: flex;
        align-items: center;
        gap: 12px;
        min-width: 260px;
        box-sizing: border-box;
        padding: 12px 16px;
        color: #333333;
        background: #ffffff;
        border: 1px solid #e1e5e2;
        border-radius: 10px;
    }

    .date-picker:focus-within {
        outline: 2px solid #17634e;
    }

    .date-text {
        flex: 1;
        font-weight: 600;
    }

    .chevron {
        color: #6b7974;
    }

    .date-input {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        opacity: 0;
        cursor: pointer;
    }

    /* ---------- สรุป ---------- */
    .summary {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 16px;
        margin-bottom: 28px;
    }

    .card {
        padding: 20px 24px;
        border-radius: 12px;
    }

    .total-card {
        color: #ffffff;
        background: #17634e;
    }

    .count-card {
        background: #ffffff;
        border: 1px solid #e1e5e2;
    }

    .label {
        margin-bottom: 8px;
        font-size: 0.9rem;
        opacity: 0.85;
    }

    .count-card .label {
        color: #6b7974;
        opacity: 1;
    }

    .big {
        display: flex;
        align-items: baseline;
        gap: 16px;
    }

    .big strong {
        font-size: 2.4rem;
        line-height: 1.1;
    }

    .big span {
        font-size: 0.9rem;
        opacity: 0.85;
    }

    .big.dark strong {
        color: #222222;
    }

    .big.dark span {
        color: #6b7974;
        opacity: 1;
    }

    .count-row {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 12px;
    }

    .tz {
        font-size: 0.85rem;
        color: #6b7974;
    }

    /* ---------- รายการขาย + รายละเอียดบิล ---------- */
    .lower {
        display: grid;
        grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
        gap: 24px;
        align-items: start;
    }

    .list-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 12px;
    }

    h3 {
        margin: 0;
        font-size: 1.15rem;
        color: #222222;
    }

    .sort {
        position: relative;
        display: flex;
        align-items: center;
    }

    .sort select {
        appearance: none;
        padding: 8px 36px 8px 14px;
        font: inherit;
        font-size: 0.9rem;
        color: #333333;
        background: #ffffff;
        border: 1px solid #e1e5e2;
        border-radius: 8px;
        cursor: pointer;
    }

    .sort select:focus-visible {
        outline: 2px solid #17634e;
    }

    .sort .chevron {
        position: absolute;
        right: 12px;
        color: #6b7974;
        pointer-events: none;
    }

    .table {
        overflow: hidden;
        background: #ffffff;
        border: 1px solid #e1e5e2;
        border-radius: 12px;
    }

    .row {
        display: grid;
        grid-template-columns: 1.2fr 1fr 1fr 1.2fr 24px;
        align-items: center;
        gap: 8px;
        width: 100%;
        box-sizing: border-box;
        padding: 16px 20px;
        text-align: left;
        font: inherit;
        color: #333333;
    }

    .row.header {
        padding: 12px 20px;
        font-size: 0.85rem;
        color: #6b7974;
        background: #fafbfa;
        border-bottom: 1px solid #edf0ee;
    }

    .row.item {
        background: #ffffff;
        border: none;
        border-bottom: 1px solid #edf0ee;
        cursor: pointer;
    }

    .row.item:last-child {
        border-bottom: none;
    }

    .row.item:hover {
        background: #f5f6f3;
    }

    .row.item.active {
        background: #eaf3eb;
    }

    .bill,
    .amount {
        font-weight: 700;
    }

    .row.item.active .bill {
        color: #17634e;
    }

    .go {
        color: #6b7974;
    }

    .empty {
        margin: 0;
        padding: 32px;
        text-align: center;
        color: #6b7974;
    }

    .foot {
        margin: 12px 0 0;
        font-size: 0.85rem;
        color: #6b7974;
    }

    .detail {
        padding: 24px;
        background: #ffffff;
        border: 1px solid #e1e5e2;
        border-radius: 12px;
    }

    .detail-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
    }

    .detail-head h3 {
        font-size: 1.2rem;
    }

    .badge {
        padding: 4px 12px;
        font-size: 0.85rem;
        font-weight: 700;
        color: #17634e;
        background: #eaf3eb;
        border-radius: 6px;
    }

    .detail-date {
        margin: 8px 0 16px;
        font-size: 0.9rem;
        color: #6b7974;
    }

    .divider {
        height: 1px;
        margin: 16px 0;
        background: #edf0ee;
    }

    .items-row {
        display: grid;
        grid-template-columns: 1fr 64px 96px;
        align-items: center;
        gap: 8px;
    }

    .items-head {
        font-size: 0.8rem;
        color: #6b7974;
    }

    .items {
        margin: 0;
        padding: 0;
        list-style: none;
    }

    .items li {
        padding: 12px 0;
    }

    .c {
        text-align: center;
    }

    .r {
        text-align: right;
    }

    .item-name {
        font-weight: 600;
        color: #222222;
    }

    .item-unit {
        font-size: 0.8rem;
        color: #6b7974;
    }

    .line {
        font-weight: 600;
    }

    .detail-total {
        display: flex;
        align-items: center;
        justify-content: space-between;
    }

    .detail-total span {
        font-weight: 700;
        font-size: 1.1rem;
        color: #222222;
    }

    .detail-total strong {
        font-size: 1.8rem;
        color: #17634e;
    }

    .note {
        margin: 16px 0 0;
        font-size: 0.8rem;
        color: #6b7974;
    }

    @media (max-width: 960px) {
        .lower {
            grid-template-columns: 1fr;
        }
    }

    @media (max-width: 640px) {
        .head {
            flex-direction: column;
        }

        .summary {
            grid-template-columns: 1fr;
        }
    }
</style>
