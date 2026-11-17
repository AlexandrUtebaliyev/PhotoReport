// Маршруты на hash: #/, #/e/<лист>/<id>, #/stats, #/archive
export function parseRoute(hash = location.hash) {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  if (parts[0] === 'e' && parts.length >= 3) return { name: 'entry', sheet: parts[1], id: parts[2] };
  if (parts[0] === 'stats') return { name: 'stats' };
  if (parts[0] === 'archive') return { name: 'archive' };
  return { name: 'feed' };
}

export const entryHref = (e) => `#/e/${encodeURIComponent(e.sheet)}/${encodeURIComponent(e.id)}`;

/** routes: {feed, entry, stats, archive} → async (root, route) => cleanup|void */
export function startRouter(root, routes, onChange) {
  let cleanup = null;
  let seq = 0;
  async function go() {
    const route = parseRoute();
    const my = ++seq;
    if (typeof cleanup === 'function') { try { cleanup(); } catch (e) { console.error(e); } }
    cleanup = null;
    onChange?.(route);
    // каждый экран получает свой контейнер, чтобы обработчики не накапливались
    const screen = document.createElement('div');
    root.replaceChildren(screen);
    const c = await routes[route.name](screen, route, () => my === seq);
    if (my === seq) cleanup = c; else if (typeof c === 'function') c();
  }
  addEventListener('hashchange', go);
  go();
  return go;
}
