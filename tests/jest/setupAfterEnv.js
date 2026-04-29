// Jest setup applied after the test framework boots. Polyfills the
// browser APIs that JSDOM doesn't ship and that Carbon depends on
// at render time. Add minimally — only the surfaces Carbon
// genuinely needs in unit tests.

// ResizeObserver — Carbon's useResizeObserver() reads .observe and
// .unobserve eagerly at first render. JSDOM does not provide this
// constructor; without it Carbon throws "Right-hand side of
// 'instanceof' is not callable" during commitLayoutEffects.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// IntersectionObserver — same pattern; Carbon's lazy menu scroll
// hooks rely on it. JSDOM has no implementation.
if (typeof globalThis.IntersectionObserver === 'undefined') {
  globalThis.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return []; }
  };
}
