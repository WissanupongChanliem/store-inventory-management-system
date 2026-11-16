let path = $state(location.pathname)

// ปุ่ม Back/Forward ของเบราว์เซอร์
window.addEventListener('popstate', () => {
    path = location.pathname
})

export const router = {
    get path() {
        return path
    },
    navigate(to, { replace = false } = {}) {
        if (to === location.pathname) return
        if (replace) {
            history.replaceState({}, '', to)
        } else {
            history.pushState({}, '', to)
        }
        path = location.pathname
    }
}