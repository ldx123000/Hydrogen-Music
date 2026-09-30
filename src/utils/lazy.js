export default {
    created(el) {
        // Let WebView defer the current src. Capturing it in an observer can
        // restore an old cover when Vue reuses a list item before it is visible.
        el.loading = 'lazy'
    }
}
