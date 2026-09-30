// Read the visible page without changing playback, navigation, or account data.
(() => {
  const rect = element => {
    const bounds = element.getBoundingClientRect()
    return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }
  }
  const viewportWidth = document.documentElement.clientWidth
  const visibleImages = [...document.images].filter(image => {
    const bounds = image.getBoundingClientRect()
    return bounds.width > 0 && bounds.height > 0
      && bounds.bottom > 0 && bounds.top < innerHeight
      && bounds.right > 0 && bounds.left < viewportWidth
  })
  return {
    route: location.hash,
    viewport: { width: viewportWidth, height: innerHeight, scale: devicePixelRatio },
    mobile: document.documentElement.dataset.hmMobile,
    theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
    documentWidth: document.documentElement.scrollWidth,
    visibleImages: visibleImages.map(image => ({
      bounds: rect(image),
      loaded: image.complete && image.naturalWidth > 0,
      hasSource: !!image.getAttribute('src'),
    })),
    playerActions: [...document.querySelectorAll('.music-player .song-control > *')]
      .filter(element => element.getBoundingClientRect().width > 0)
      .map(element => ({
        title: element.getAttribute('aria-label') || element.getAttribute('title'),
        bounds: rect(element),
      })),
  }
})()
