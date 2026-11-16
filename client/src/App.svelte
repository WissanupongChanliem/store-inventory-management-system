<script>
  import { onMount } from "svelte";
  import { api } from "./lib/api.js";
  import { router } from "./lib/router.svelte.js";
  import Login from "./lib/Login.svelte";
  import Products from "./lib/Products.svelte";
  import Sidebar from "./lib/Sidebar.svelte";
  import Checkout from "./lib/Checkout.svelte";

  // หน้าที่ยังไม่ได้ทำ แสดงเป็นหน้าชั่วคราว
  const comingSoon = {
    "/sales": "ยอดขายรายวัน",
    "/account": "บัญชีของฉัน",
  };

  let user = $state(null);
  let checking = $state(true);

  onMount(async () => {
    try {
      const json = await api.me();
      user = json.user;
    } catch {
      // ยังไม่ได้เข้าสู่ระบบหรือเชื่อมต่อไม่ได้ ให้แสดงหน้า login
    } finally {
      checking = false;
    }
  });

  // ยังไม่ล็อกอิน ให้ไป /login; ล็อกอินแล้วแต่อยู่ที่ / หรือ /login ให้ไป /products
  $effect(() => {
    if (checking) return;
    if (!user && router.path !== "/login") {
      router.navigate("/login", { replace: true });
    } else if (user && (router.path === "/" || router.path === "/login")) {
      router.navigate("/products", { replace: true });
    }
  });

  async function logout() {
    try {
      await api.logout();
    } catch {
      // ไม่ว่าจะสำเร็จหรือไม่ ให้กลับหน้า login
    }
    user = null;
  }
</script>

{#if checking}
  <p class="status">กำลังตรวจสอบ...</p>
{:else if !user}
  <Login onlogin={(u) => (user = u)} />
{:else}
  <div class="layout">
    <Sidebar {user} onlogout={logout} />
    <main>
      <header class="topbar">ร้านของฉัน</header>
      {#if router.path === "/products"}
        <Products />
      {:else if router.path === "/checkout"}
        <Checkout />

      {:else if comingSoon[router.path]}
        <section class="placeholder">
          <h2>{comingSoon[router.path]}</h2>
          <p>หน้านี้ยังไม่พร้อมใช้งาน</p>
        </section>
      {:else if router.path !== "/" && router.path !== "/login"}
        <section class="placeholder">
          <h2>ไม่พบหน้านี้</h2>
          <p>ตรวจสอบ URL อีกครั้ง หรือเลือกเมนูด้านข้าง</p>
        </section>
      {/if}
    </main>
  </div>
{/if}

<style>
  .status {
    padding: 24px;
  }

  .layout {
    display: flex;
    min-height: 100vh;
  }

  main {
    flex: 1;
    min-width: 0;
  }

  .topbar {
    position: sticky;
    top: 0;
    display: flex;
    align-items: center;
    height: 64px;
    box-sizing: border-box;
    padding: 0 24px;
    font-size: 1.15rem;
    font-weight: 600;
    color: #17634e;
    background: #ffffff;
    border-bottom: 1px solid #e1e5e2;
  }

  .placeholder {
    max-width: 960px;
    margin: 0 auto;
    padding: 24px 16px;
  }

  .placeholder h2 {
    margin: 0 0 8px;
    color: #17634e;
  }

  @media (max-width: 720px) {
    .layout {
      flex-direction: column;
    }
  }
</style>
