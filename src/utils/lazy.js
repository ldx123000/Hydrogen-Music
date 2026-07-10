export default {
    mounted(el) {
        const imgSrc = el.src
        el.src = ''
        const observer = new IntersectionObserver(([{isIntersecting}]) => {
            if(isIntersecting) {
                el.src = imgSrc
                observer.unobserve(el)
            }
        })
        el.__lazyImageObserver = observer
        observer.observe(el)
    },
    unmounted(el) {
        el.__lazyImageObserver?.disconnect()
        delete el.__lazyImageObserver
    }
}
