// The app shell scrolls inside a height-capped #root, not the window. Find the actual
// scroll ancestor so IntersectionObservers (reveals, defer-mounts, viewport gating)
// fire correctly. Returns null to fall back to the viewport.
export function getScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node) {
    const oy = getComputedStyle(node).overflowY;
    if ((oy === "auto" || oy === "scroll" || oy === "overlay") && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}
