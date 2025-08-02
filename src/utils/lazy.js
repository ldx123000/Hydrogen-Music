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
        observer.observe(el)
    }
}