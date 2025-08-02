export const absolutePosition = (element, target) => {
    if (element) {
        let elementDimensions = {
            width: element.offsetWidth,
            height: element.offsetHeight || Math.min(parseInt(element.style.maxHeight.slice(0, -2)), element.scrollHeight + 16),
        };
        let elementOuterHeight = elementDimensions.height;
        let elementOuterWidth = elementDimensions.width;
        let targetOuterHeight = target.offsetHeight;
        let targetOuterWidth = target.offsetWidth;
        let targetOffset = target.getBoundingClientRect();
        let windowScrollTop = getWindowScrollTop();
        let windowScrollLeft = getWindowScrollLeft();
        let viewport = getViewport();
        let top, left;

        if (
            targetOffset.top + targetOuterHeight + elementOuterHeight >
            viewport.height
        ) {
            top = targetOffset.top + windowScrollTop - elementOuterHeight;
            element.style.transformOrigin = "bottom";

            if (top < 0) {
                top = windowScrollTop;
            }
        } else {
            top = targetOuterHeight + targetOffset.top + windowScrollTop + 1;
            element.style.transformOrigin = "top";
        }

        if (targetOffset.left + elementOuterWidth > viewport.width)
            left = Math.max(
                0,
                targetOffset.left +
                windowScrollLeft +
                targetOuterWidth -
                elementOuterWidth
            );
        else left = targetOffset.left + windowScrollLeft;

        element.style.top = top + "px";
        element.style.left = left + "px";
    }
};
export const getWindowScrollTop = () => {
    let doc = document.documentElement;

    return (window.pageYOffset || doc.scrollTop) - (doc.clientTop || 0);
};
export const getWindowScrollLeft = () => {
    let doc = document.documentElement;

    return (window.pageXOffset || doc.scrollLeft) - (doc.clientLeft || 0);
};
export const getViewport = () => {
    let win = window,
        d = document,
        e = d.documentElement,
        g = d.getElementsByTagName("body")[0],
        w = win.innerWidth || e.clientWidth || g.clientWidth,
        h = win.innerHeight || e.clientHeight || g.clientHeight;

    return { width: w, height: h };
};