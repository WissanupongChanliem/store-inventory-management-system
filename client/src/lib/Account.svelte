<script>
    import { untrack } from "svelte";
    import { api, ApiError } from "./api.js";

    let { user, onlogout } = $props();

    let form = $state({
        currentPassword: "",
        newUsername: untrack(() => user.username),
        newPassword: "",
        confirmPassword: "",
    });
    let visible = $state({
        currentPassword: false,
        newPassword: false,
        confirmPassword: false,
    });
    let fieldErrors = $state({});
    let formError = $state("");
    let saving = $state(false);

    const ICON_EYE =
        '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>';
    const ICON_EYE_OFF =
        '<path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/>';

    function validate() {
        const errors = {};
        const newUsername = form.newUsername.trim();
        const usernameChanged = newUsername !== user.username;
        const passwordFilled = form.newPassword !== "";

        if (form.currentPassword === "") {
            errors.currentPassword = "กรุณากรอกรหัสผ่านปัจจุบัน";
        }
        if (newUsername.length < 1 || newUsername.length > 100) {
            errors.newUsername = "ชื่อผู้ใช้ต้องยาว 1–100 ตัวอักษร";
        }
        if (passwordFilled) {
            if (form.newPassword.length < 12 || form.newPassword.length > 128) {
                errors.newPassword = "รหัสผ่านใหม่ต้องยาว 12–128 ตัวอักษร";
            }
            if (form.confirmPassword !== form.newPassword) {
                errors.confirmPassword = "รหัสผ่านยืนยันไม่ตรงกัน";
            }
        } else if (form.confirmPassword !== "") {
            errors.newPassword = "กรุณากรอกรหัสผ่านใหม่";
        }

        return { errors, newUsername, usernameChanged, passwordFilled };
    }

    function handleError(e) {
        if (e instanceof ApiError) {
            if (e.code === "INVALID_CREDENTIALS") {
                fieldErrors = { currentPassword: "รหัสผ่านปัจจุบันไม่ถูกต้อง" };
                return;
            }
            if (e.code === "VALIDATION_ERROR") {
                const map = {};
                for (const d of e.details ?? []) {
                    if (
                        ["currentPassword", "newUsername", "newPassword"].includes(
                            d.field,
                        )
                    ) {
                        map[d.field] = d.message;
                    }
                }
                fieldErrors = map;
                if (Object.keys(map).length === 0) {
                    formError = e.message || "ข้อมูลไม่ถูกต้อง";
                }
                return;
            }
        }
        formError = "บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง";
    }

    async function submit(event) {
        event.preventDefault();
        if (saving) return;
        formError = "";

        const { errors, newUsername, usernameChanged, passwordFilled } =
            validate();
        fieldErrors = errors;
        if (Object.keys(errors).length > 0) return;

        if (!usernameChanged && !passwordFilled) {
            formError = "ยังไม่มีการเปลี่ยนแปลง กรุณาแก้ชื่อผู้ใช้หรือรหัสผ่านใหม่";
            return;
        }

        // ส่งเฉพาะ field ที่เปลี่ยนจริง; confirmPassword ตรวจเฉพาะฝั่ง frontend
        const data = { currentPassword: form.currentPassword };
        if (usernameChanged) data.newUsername = newUsername;
        if (passwordFilled) data.newPassword = form.newPassword;

        saving = true;
        try {
            await api.updateAccount(data);
            // server ยกเลิก session ทั้งหมดแล้ว → ออกจากระบบและกลับไปหน้า login
            onlogout();
        } catch (e) {
            handleError(e);
        } finally {
            saving = false;
        }
    }
</script>

{#snippet passwordField(key, label, placeholder, autocomplete, required)}
    <label for="acc-{key}">
        {label}{#if required}<span class="req" aria-hidden="true"> *</span>{/if}
    </label>
    <div class="input-wrap">
        <input
            id="acc-{key}"
            type={visible[key] ? "text" : "password"}
            {placeholder}
            {autocomplete}
            aria-required={required}
            aria-invalid={fieldErrors[key] ? "true" : undefined}
            bind:value={form[key]}
        />
        <button
            type="button"
            class="toggle"
            aria-label={visible[key] ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
            aria-pressed={visible[key]}
            onclick={() => (visible[key] = !visible[key])}
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
                {@html visible[key] ? ICON_EYE_OFF : ICON_EYE}
            </svg>
        </button>
    </div>
    {#if fieldErrors[key]}<p class="field-error">{fieldErrors[key]}</p>{/if}
{/snippet}

<section class="account">
    <h2>บัญชีของฉัน</h2>
    <br>
    <div class="grid">
        <form class="card" onsubmit={submit} novalidate>
            <h3>ข้อมูลการเข้าสู่ระบบ</h3>

            <div class="current">
                <span class="current-label">ชื่อผู้ใช้ปัจจุบัน</span>
                <strong>{user.username}</strong>
            </div>

            {@render passwordField(
                "currentPassword",
                "รหัสผ่านปัจจุบัน",
                "กรอกรหัสผ่านปัจจุบัน",
                "new-password",
                true,
            )}

            <label for="acc-newUsername">ชื่อผู้ใช้ใหม่</label>
            <input
                id="acc-newUsername"
                type="text"
                autocomplete="off"
                aria-invalid={fieldErrors.newUsername ? "true" : undefined}
                bind:value={form.newUsername}
            />
            {#if fieldErrors.newUsername}
                <p class="field-error">{fieldErrors.newUsername}</p>
            {/if}

            {@render passwordField(
                "newPassword",
                "รหัสผ่านใหม่",
                "กรอกรหัสผ่านใหม่",
                "new-password",
                false,
            )}

            {@render passwordField(
                "confirmPassword",
                "ยืนยันรหัสผ่านใหม่",
                "กรอกรหัสผ่านใหม่อีกครั้ง",
                "new-password",
                false,
            )}

            {#if formError}
                <p class="error" role="alert">{formError}</p>
            {/if}

            <button type="submit" class="save" disabled={saving}>
                {saving ? "กำลังบันทึก..." : "บันทึกการเปลี่ยนแปลง"}
            </button>
        </form>

        <aside class="note">
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
                <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <h3>ดูแลบัญชีให้ปลอดภัย</h3>
            <p class="muted">
                ใช้รหัสผ่านปัจจุบันเพื่อยืนยันตัวตน ก่อนเปลี่ยนข้อมูลบัญชี
            </p>
            <p class="after">
                หลังบันทึกสำเร็จ คุณจะออกจากระบบ และต้องเข้าสู่ระบบด้วยข้อมูลใหม่
            </p>
        </aside>
    </div>
</section>

<style>
    .account {
        max-width: 960px;
        margin: 0 auto;
        padding: 24px 16px 48px;
    }

    h2 {
        margin: 0 0 4px;
        font-size: 1.8rem;
        color: #17634e;
    }

    .subtitle {
        margin: 0 0 24px;
        font-size: 0.95rem;
        color: #666;
    }

    .grid {
        display: grid;
        grid-template-columns: minmax(0, 1.9fr) minmax(0, 1fr);
        gap: 24px;
        align-items: start;
    }

    .card {
        display: flex;
        flex-direction: column;
        box-sizing: border-box;
        padding: 28px 24px 24px;
        background: #ffffff;
        border: 1px solid #e1e5e2;
        border-radius: 14px;
    }

    .card h3 {
        margin: 0 0 20px;
        font-size: 1.2rem;
        color: #1f2a26;
    }

    .current {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding-bottom: 20px;
        margin-bottom: 20px;
        border-bottom: 1px solid #e1e5e2;
    }

    .current-label {
        font-size: 0.85rem;
        color: #777;
    }

    .current strong {
        font-size: 1.05rem;
    }

    label {
        margin-bottom: 8px;
        font-size: 0.95rem;
        font-weight: 600;
        color: #222;
    }

    .req {
        color: #222;
    }

    input {
        width: 100%;
        box-sizing: border-box;
        margin-bottom: 20px;
        padding: 14px 16px;
        font: inherit;
        background: #ffffff;
        border: 1px solid #e1e5e2;
        border-radius: 10px;
    }

    input::placeholder {
        color: #9aa19e;
    }

    input:focus {
        outline: 2px solid #17634e;
        border-color: #17634e;
    }

    input[aria-invalid="true"] {
        border-color: #b3261e;
    }

    .input-wrap {
        position: relative;
    }

    .input-wrap input {
        padding-right: 48px;
    }

    .toggle {
        position: absolute;
        top: 0;
        bottom: 20px;
        right: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 44px;
        padding: 0;
        color: #666;
        background: transparent;
        border: none;
        border-radius: 8px;
        cursor: pointer;
    }

    .toggle:hover {
        color: #17634e;
    }

    .toggle:focus-visible {
        outline: 2px solid #17634e;
    }

    /* field-error อยู่ใต้ .input-wrap ซึ่งมี input ที่ margin-bottom 20px */
    .field-error {
        margin: -14px 0 16px;
        font-size: 0.9rem;
        color: #b3261e;
    }

    .error {
        margin: 0 0 16px;
        font-size: 0.95rem;
        color: #b3261e;
    }

    .save {
        padding: 16px;
        font: inherit;
        font-weight: 600;
        color: #ffffff;
        background: #17634e;
        border: none;
        border-radius: 10px;
        cursor: pointer;
    }

    .save:hover:not(:disabled) {
        background: #124f3e;
    }

    .save:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }

    .note {
        box-sizing: border-box;
        padding: 24px;
        color: #17634e;
        background: #eaf3eb;
        border-radius: 14px;
    }

    .note h3 {
        margin: 20px 0 12px;
        font-size: 1.1rem;
        color: #1f2a26;
    }

    .note .muted {
        margin: 0 0 16px;
        padding-bottom: 16px;
        font-size: 0.9rem;
        line-height: 1.6;
        color: #7a8580;
        border-bottom: 1px solid #d6e3d8;
    }

    .note .after {
        margin: 0;
        font-size: 0.9rem;
        font-weight: 600;
        line-height: 1.6;
        color: #1f2a26;
    }

    @media (max-width: 720px) {
        .grid {
            grid-template-columns: minmax(0, 1fr);
        }
    }
</style>
