<script>
    import { router } from "./router.svelte.js";

    let { user, onlogout } = $props();

    const items = [
        {
            label: "รายการสินค้า",
            path: "/products",
            // กล่องพัสดุ
            icon: '<path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
        },
        {
            label: "ขายสินค้า",
            path: "/checkout",
            // รถเข็นสินค้า
            icon: '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
        },
        {
            label: "ยอดขายรายวัน",
            path: "/sales",
            // กระดาษรายการ
            icon: '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/>',
        },
        {
            label: "บัญชีของฉัน",
            path: "/account",
            // รูปคน
            icon: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
        },
    ];

    function go(event, path) {
        // ปล่อยให้ Ctrl/Cmd+คลิก เปิดแท็บใหม่ได้ตามปกติ
        if (
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey ||
            event.button !== 0
        ) {
            return;
        }
        event.preventDefault();
        router.navigate(path);
    }
</script>

<aside class="sidebar">
    <div class="brand">Simple Stock</div>

    <nav aria-label="เมนูหลัก">
        <ul>
            {#each items as item (item.path)}
                <li>
                    <a
                        href={item.path}
                        aria-current={router.path === item.path
                            ? "page"
                            : undefined}
                        onclick={(e) => go(e, item.path)}
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
                            {@html item.icon}
                        </svg>
                        <span>{item.label}</span>
                    </a>
                </li>
            {/each}
        </ul>
    </nav>

    <div class="user">
        <span>{user.username}</span>
        <button type="button" onclick={onlogout}>
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
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" x2="9" y1="12" y2="12" />
            </svg>
            <span>ออกจากระบบ</span>
        </button>
    </div>
</aside>

<style>
    .sidebar {
        position: sticky;
        top: 0;
        width: 260px;
        height: 100vh;
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
        box-sizing: border-box;
        padding: 24px 16px;
        color: #222222;
        background: #ffffff;
        border-right: 1px solid #e1e5e2;
    }

    .brand {
        margin-bottom: 32px;
        padding: 0 12px;
        font-size: 1.3rem;
        font-weight: 700;
        color: #17634e;
    }

    nav {
        flex: 1;
    }

    ul {
        margin: 0;
        padding: 0;
        list-style: none;
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    a {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 14px 12px;
        font-size: 1.05rem;
        color: #333333;
        text-decoration: none;
        border-radius: 10px;
    }

    a svg {
        flex-shrink: 0;
    }

    a:hover {
        background: #f5f6f3;
    }

    a[aria-current="page"] {
        font-weight: 600;
        color: #17634e;
        background: #eaf3eb;
    }

    .user {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 16px 12px 0;
        border-top: 1px solid #e1e5e2;
    }

    .user button {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 10px 14px;
        font: inherit;
        color: #6b7974;
        background: transparent;
        border: 1px solid #6b7974;
        border-radius: 8px;
        cursor: pointer;
    }

    .user button:hover {
        background: #f5f6f3;
    }

    @media (max-width: 720px) {
        .sidebar {
            position: static;
            width: 100%;
            height: auto;
            padding: 16px;
            border-right: none;
            border-bottom: 1px solid #e1e5e2;
        }

        .brand {
            margin-bottom: 12px;
        }

        ul {
            flex-direction: row;
            flex-wrap: wrap;
        }

        .user {
            flex-direction: row;
            align-items: center;
            justify-content: space-between;
            margin-top: 12px;
        }
    }
</style>
