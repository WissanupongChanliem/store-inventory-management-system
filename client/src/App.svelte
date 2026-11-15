<script>
  import { onMount } from 'svelte'
  import Login from './lib/Login.svelte'

  let user = $state(null)
  let checking = $state(true)

  onMount(async () => {
    try {
      const res = await fetch('/api/auth/me')
      if (res.ok) {
        const json = await res.json()
        user = json.user
      }
    } catch {
      // เชื่อมต่อไม่ได้ ให้แสดงหน้า login ต่อไป
    } finally {
      checking = false
    }
  })
</script>

{#if checking}
  <p>กำลังตรวจสอบ...</p>
{:else if user}
  <h1>เข้าสู่ระบบแล้ว: {user.username}</h1>
{:else}
  <Login onlogin={(u) => (user = u)} />
{/if}