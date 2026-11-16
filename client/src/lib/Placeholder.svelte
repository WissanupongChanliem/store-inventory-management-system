<script>
    let { title, message = "หน้านี้ยังไม่ได้พัฒนา" } = $props();
</script>

<section>
    <h2>{title}</h2>
    <p>{message}</p>
</section>

<style>
    section {
        max-width: 960px;
        margin: 0 auto;
        padding: 24px 16px;
    }

    h2 {
        margin: 0 0 12px;
        font-size: 1.8rem;
        color: #17634e;
    }

    p {
        color: #777;
    }
</style>
