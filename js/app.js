import { startRouter } from './router.js';
import { icons } from './util.js';
import * as feed from './views/feed.js';
import * as entry from './views/entry.js';
import * as stats from './views/stats.js';
import * as archive from './views/archive.js';

document.querySelectorAll('[data-icon]').forEach((el) => { el.innerHTML = icons[el.dataset.icon]; });

const view = document.getElementById('view');
const tabbar = document.getElementById('tabbar');
const tabs = [...tabbar.querySelectorAll('[data-tab]')];

startRouter(view, {
  feed: feed.mount,
  entry: entry.mount,
  stats: stats.mount,
  archive: archive.mount,
}, (route) => {
  const isEntry = route.name === 'entry';
  tabbar.classList.toggle('hidden', isEntry);
  view.classList.toggle('no-tabs', isEntry);
  tabs.forEach((t) => {
    if (t.dataset.tab === route.name) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
  });
  if (route.name !== 'feed') window.scrollTo(0, 0);
});

if ('serviceWorker' in navigator) {
  addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('SW не зарегистрирован', e));
  });
}
