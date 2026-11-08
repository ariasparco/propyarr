// Boots the built-in monitoring scheduler. The Node-only work lives in a
// separate module loaded behind a runtime check, so nothing server-only is
// pulled into the edge bundle.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./instrumentation.node');
  }
}
