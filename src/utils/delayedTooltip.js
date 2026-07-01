const TOOLTIP_DELAY_MS = 500;
const POINTER_MOVE_TOLERANCE_PX = 4;

const tooltipState = new WeakMap();
let activeTooltip = null;

function removeTooltip() {
  if (activeTooltip) {
    activeTooltip.remove();
    activeTooltip = null;
  }
}

function normalizeTooltipText(value) {
  return typeof value == "string" ? value.trim() : "";
}

function positionTooltip(tooltip, event) {
  const viewportPadding = 8;
  const offset = 12;
  const { innerWidth, innerHeight } = window;
  const rect = tooltip.getBoundingClientRect();
  const nextLeft = Math.min(
    Math.max(event.clientX + offset, viewportPadding),
    innerWidth - rect.width - viewportPadding,
  );
  const nextTop = Math.min(
    Math.max(event.clientY + offset, viewportPadding),
    innerHeight - rect.height - viewportPadding,
  );

  tooltip.style.left = `${nextLeft}px`;
  tooltip.style.top = `${nextTop}px`;
}

function showTooltip(text, event) {
  if (!text) return;

  removeTooltip();
  const tooltip = document.createElement("div");
  tooltip.className = "delayed-tooltip";
  tooltip.textContent = text;
  document.body.appendChild(tooltip);
  activeTooltip = tooltip;
  positionTooltip(tooltip, event);
}

function pointerMovedEnough(previousEvent, nextEvent) {
  if (!previousEvent) return true;
  return (
    Math.abs(nextEvent.clientX - previousEvent.clientX) >
      POINTER_MOVE_TOLERANCE_PX ||
    Math.abs(nextEvent.clientY - previousEvent.clientY) >
      POINTER_MOVE_TOLERANCE_PX
  );
}

export const vDelayedTooltip = {
  mounted(el, binding) {
    let lastEvent = null;
    let timer = null;

    const clearTimer = () => {
      if (!timer) return;
      clearTimeout(timer);
      timer = null;
    };

    const state = {
      text: normalizeTooltipText(binding.value),
      schedule: null,
      handleMove: null,
      cancel: null,
    };

    const schedule = (event) => {
      lastEvent = event;
      clearTimer();
      removeTooltip();
      timer = window.setTimeout(() => {
        timer = null;
        if (lastEvent) showTooltip(state.text, lastEvent);
      }, TOOLTIP_DELAY_MS);
    };

    const handleMove = (event) => {
      if (pointerMovedEnough(lastEvent, event)) schedule(event);
    };

    const cancel = () => {
      clearTimer();
      removeTooltip();
    };

    state.schedule = schedule;
    state.handleMove = handleMove;
    state.cancel = cancel;

    el.addEventListener("pointerenter", state.schedule);
    el.addEventListener("pointermove", state.handleMove);
    el.addEventListener("pointerleave", state.cancel);
    el.addEventListener("pointerdown", state.cancel);
    el.addEventListener("click", state.cancel);

    tooltipState.set(el, state);
  },
  updated(el, binding) {
    const state = tooltipState.get(el);
    if (state) state.text = normalizeTooltipText(binding.value);
  },
  beforeUnmount(el) {
    const state = tooltipState.get(el);
    if (!state) return;
    el.removeEventListener("pointerenter", state.schedule);
    el.removeEventListener("pointermove", state.handleMove);
    el.removeEventListener("pointerleave", state.cancel);
    el.removeEventListener("pointerdown", state.cancel);
    el.removeEventListener("click", state.cancel);
    state.cancel();
    tooltipState.delete(el);
  },
};
