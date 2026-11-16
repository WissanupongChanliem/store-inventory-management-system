<script>
    import { api, ApiError } from "./api.js";
    let { onlogin } = $props();

    let username = $state("");
    let password = $state("");
    let error = $state("");
    let loading = $state(false);
    let showPassword = $state(false);

    async function handleSubmit(event) {
        event.preventDefault();
        error = "";
        loading = true;

        try {
            const json = await api.login(username, password);
            onlogin(json.user);
        } catch (e) {
            if (e instanceof ApiError && e.status === 401) {
                error = "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง";
            } else if (e instanceof ApiError && e.status === 422) {
                error = "กรุณากรอกชื่อผู้ใช้และรหัสผ่านให้ครบ";
            } else if (e instanceof ApiError) {
                error = "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง";
            } else {
                error = "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้";
            }
        } finally {
            loading = false;
        }
    }
</script>

<main class="page">
    <section class="card">
        <h1>ยินดีต้อนรับกลับ</h1>
        <p class="subtitle">เข้าสู่ระบบเพื่อเริ่มจัดการร้านของคุณ</p>

        <form onsubmit={handleSubmit}>
            <label for="username">ชื่อผู้ใช้</label>
            <input
                id="username"
                type="text"
                autocomplete="username"
                placeholder="กรอกชื่อผู้ใช้"
                bind:value={username}
                required
            />

            <label for="password">รหัสผ่าน</label>
            <div class="password-field">
                <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autocomplete="current-password"
                    placeholder="กรอกรหัสผ่าน"
                    bind:value={password}
                    required
                />
                <button
                    type="button"
                    class="toggle"
                    onclick={() => (showPassword = !showPassword)}
                    aria-label={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                    aria-pressed={showPassword}
                >
                    {#if showPassword}
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
                            <path
                                d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"
                            />
                            <path
                                d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"
                            />
                            <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                            <line x1="1" y1="1" x2="23" y2="23" />
                        </svg>
                    {:else}
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
                            <path
                                d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"
                            />
                            <circle cx="12" cy="12" r="3" />
                        </svg>
                    {/if}
                </button>
            </div>
            {#if error}
                <p class="error" role="alert">{error}</p>
            {/if}

            <button type="submit" disabled={loading}>
                {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
            </button>
        </form>
    </section>
</main>

<style>
    .page {
        min-height: 100vh;
        min-height: 100dvh;
        box-sizing: border-box;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        background: #f5f6f3;
        margin: 0;
    }

    .card {
        width: 100%;
        max-width: 520px;
    }

    h1 {
        margin: 0 0 12px;
        font-size: 2.5rem;
        color: #17634e;
    }

    .subtitle {
        margin: 0 0 40px;
        font-size: 1.2rem;
        color: #555;
    }

    form {
        display: flex;
        flex-direction: column;
    }

    label {
        margin-bottom: 8px;
        font-size: 1.1rem;
        font-weight: 600;
        color: #222;
    }

    input {
        margin-bottom: 24px;
        padding: 16px 18px;
        font-size: 1.15rem;
        background: #ffffff;
        border: 1px solid #c9cfcc;
        border-radius: 10px;
    }

    input:focus {
        outline: 2px solid #17634e;
        border-color: #17634e;
    }

    .error {
        margin: 0 0 24px;
        font-size: 1rem;
        color: #b3261e;
    }

    button[type="submit"] {
        padding: 18px;
        font-size: 1.2rem;
        font-weight: 600;
        color: #ffffff;
        background: #17634e;
        border: none;
        border-radius: 10px;
        cursor: pointer;
    }

    button[type="submit"]:hover:not(:disabled) {
        background: #124f3e;
    }

    button[type="submit"]:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }

    .password-field {
        position: relative;
        margin-bottom: 24px;
    }

    .password-field input {
        width: 100%;
        box-sizing: border-box;
        margin-bottom: 0;
        padding-right: 56px;
    }

    .toggle {
        position: absolute;
        top: 0;
        right: 0;
        bottom: 0;
        width: 52px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        color: #6b7974;
        background: transparent;
        border: none;
        border-radius: 10px;
        cursor: pointer;
    }

    .toggle:focus-visible {
        outline: 2px solid #17634e;
    }
</style>
