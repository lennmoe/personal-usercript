// ==UserScript==
// @name         VNDB - Wishlist Release Alerts
// @namespace    vndb-wishlist-releases
// @version      1.2
// @description  Adds a "Wishlist releases" box to the VNDB sidebar: upcoming releases (date, month, year or TBA) and releases from the last 30 days for the VNs on your wishlist, filtered by language (EN + JP by default, no MTL). On your list page (/u123/ulist), a badge with flag and date is shown next to each matching VN. Data comes from the VNDB API using your session, is cached for 6 hours and can be refreshed from the box. The userscript manager menu lets you choose the tracked languages and force a refresh.
// @author       lennmoe
// @homepageURL  https://github.com/lennmoe/personal-usercript
// @downloadURL  https://github.com/lennmoe/personal-usercript/raw/main/vndb/VNDB%20Wishlist%20Release%20Alerts.user.js
// @updateURL    https://github.com/lennmoe/personal-usercript/raw/main/vndb/VNDB%20Wishlist%20Release%20Alerts.user.js
// @match        https://vndb.org/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function () {
  'use strict';

  const CACHE_KEY = 'releaseCache';
  const LANGS_KEY = 'langs';
  const TTL = 6 * 3600 * 1000;
  const RECENT_DAYS = 30;
  const SOON_DAYS = 30;
  const MAX_LINES = 8;
  const CHUNK = 50;

  const DAY = 86400000;
  const isoDay = (date) => date.toISOString().slice(0, 10);
  const todayKey = isoDay(new Date());

  function myUserId() {
    const links = [...document.querySelectorAll('nav a[href^="/u"]')];
    const a = links.find((x) => x.textContent.trim() === 'My Profile') || links.find((x) => /^\/u\d+$/.test(x.getAttribute('href')));
    return a?.getAttribute('href').match(/^\/(u\d+)$/)?.[1] || null;
  }

  const getLangs = () => GM_getValue(LANGS_KEY, ['en', 'ja']);

  async function api(path, body) {
    const res = await fetch(`https://api.vndb.org/kana/${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.status === 429) throw new Error('too many requests, try again later');
    if (!res.ok) throw new Error(`${res.status}`);
    return res.json();
  }

  async function paged(path, body, maxPages = 10) {
    const out = [];
    for (let page = 1; page <= maxPages; page++) {
      const r = await api(path, { ...body, results: 100, page });
      out.push(...r.results);
      if (!r.more) break;
    }
    return out;
  }

  function parseRelease(released) {
    if (!released || released === 'TBA') return { key: '9999-99-99', status: 'tba', label: 'TBA' };
    const [y, m, d] = released.split('-');
    if (!m) return { key: `${y}-99-99`, status: y < todayKey.slice(0, 4) ? 'out' : 'future', label: y };
    if (!d) {
      const monthLabel = new Date(+y, +m - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
      return { key: `${y}-${m}-99`, status: `${y}-${m}` < todayKey.slice(0, 7) ? 'out' : 'future', label: monthLabel };
    }
    const date = new Date(`${released}T00:00:00`);
    const sameYear = +y === new Date().getFullYear();
    const label = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
    let status = 'future';
    if (released <= todayKey) status = 'out';
    else if (date - Date.now() <= SOON_DAYS * DAY) status = 'soon';
    return { key: released, status, label };
  }

  async function fetchData(user) {
    const wish = await paged('ulist', { user, filters: ['label', '=', 5], fields: 'vn.title' });
    const titles = Object.fromEntries(wish.map((w) => [w.id, w.vn.title]));
    const ids = Object.keys(titles);
    const since = isoDay(new Date(Date.now() - RECENT_DAYS * DAY));
    const releases = [];
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK).map((id) => ['id', '=', id]);
      const vnFilter = chunk.length === 1 ? chunk[0] : ['or', ...chunk];
      releases.push(
        ...(await paged('release', {
          filters: ['and', ['released', '>=', since], ['vn', '=', vnFilter]],
          fields: 'id, title, released, languages.lang, languages.mtl, vns.id',
          sort: 'released',
        }))
      );
    }
    return { at: Date.now(), user, titles, releases };
  }

  function buildItems(data) {
    const langs = getLangs();
    const byKey = new Map();
    data.releases.forEach((r) => {
      const relLangs = r.languages.filter((l) => !l.mtl && (!langs.length || langs.includes(l.lang))).map((l) => l.lang);
      if (!relLangs.length) return;
      const info = parseRelease(r.released);
      if (info.status === 'out' && info.key < isoDay(new Date(Date.now() - RECENT_DAYS * DAY))) return;
      r.vns.forEach(({ id }) => {
        if (!data.titles[id]) return;
        const k = `${id}|${info.key}`;
        const item = byKey.get(k) || { vid: id, title: data.titles[id], rid: r.id, langs: [], ...info };
        relLangs.forEach((l) => item.langs.includes(l) || item.langs.push(l));
        byKey.set(k, item);
      });
    });
    const rank = { out: 0, soon: 1, future: 2, tba: 3 };
    return [...byKey.values()].sort(
      (a, b) => rank[a.status] - rank[b.status] || (a.status === 'out' ? b.key.localeCompare(a.key) : a.key.localeCompare(b.key))
    );
  }

  GM_addStyle(`
    #vra-box .vra-line { display: flex; align-items: center; gap: 3px; padding: 0; margin: 0 0 1px; }
    #vra-box .vra-line a { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    #vra-box .vra-line small { flex: none; }
    #vra-box .vra-flags { flex: none; display: inline-flex; }
    #vra-box .vra-foot { display: flex; justify-content: space-between; margin-top: 2px; font-size: 11px; }
    .vra-out { color: var(--statok); }
    .vra-soon { color: var(--standout); }
    .vra-future, .vra-tba, .vra-dim { color: var(--grayedout); }
    .vra-badge { margin-left: 6px; white-space: nowrap; font-size: 11px; }
    .vra-badge abbr { vertical-align: middle; }
  `);

  function flags(langs) {
    const span = document.createElement('span');
    span.className = 'vra-flags';
    langs.forEach((l) => {
      const abbr = document.createElement('abbr');
      abbr.className = `icon-lang-${l}`;
      abbr.title = l;
      span.appendChild(abbr);
    });
    return span;
  }

  const statusText = (item) => (item.status === 'out' ? `out ${item.label}` : item.label);

  function ago(ts) {
    const min = Math.round((Date.now() - ts) / 60000);
    if (min < 60) return `${min} min ago`;
    return `${Math.round(min / 60)} h ago`;
  }

  function renderSidebar(user, data, error) {
    const nav = document.querySelector('body > nav') || document.querySelector('#support')?.parentElement;
    if (!nav) return;
    let box = document.getElementById('vra-box');
    if (!box) {
      box = document.createElement('article');
      box.id = 'vra-box';
      const userMenu = [...nav.querySelectorAll('article')].find((a) => a.querySelector(`a[href="/${user}"]`));
      if (userMenu) userMenu.insertAdjacentElement('afterend', box);
      else nav.appendChild(box);
    }
    box.replaceChildren();

    const items = data ? buildItems(data) : [];
    const h2 = document.createElement('h2');
    h2.textContent = 'Wishlist releases';
    const hot = items.filter((i) => i.status === 'out' || i.status === 'soon').length;
    if (hot) {
      const n = document.createElement('span');
      n.className = 'notifies vra-soon';
      n.textContent = String(hot);
      h2.appendChild(n);
    }

    const div = document.createElement('div');
    if (error) {
      const p = document.createElement('p');
      p.className = 'vra-dim';
      p.textContent = `Error: ${error}`;
      div.appendChild(p);
    } else if (!data) {
      const p = document.createElement('p');
      p.className = 'vra-dim';
      p.textContent = 'Loading...';
      div.appendChild(p);
    } else if (!items.length) {
      const p = document.createElement('p');
      p.className = 'vra-dim';
      p.textContent = 'No upcoming releases.';
      div.appendChild(p);
    }

    items.slice(0, MAX_LINES).forEach((item) => {
      const p = document.createElement('p');
      p.className = 'vra-line';
      const a = document.createElement('a');
      a.href = `/${item.vid}`;
      a.textContent = item.title;
      a.title = `${item.title} — ${statusText(item)}`;
      const date = document.createElement('small');
      date.className = `vra-${item.status}`;
      date.textContent = item.status === 'out' ? 'out' : item.label;
      date.title = statusText(item);
      p.append(flags(item.langs), a, date);
      div.appendChild(p);
    });

    const foot = document.createElement('p');
    foot.className = 'vra-foot';
    const more = document.createElement('a');
    more.href = `/${user}/ulist?l=5`;
    more.textContent = items.length > MAX_LINES ? `+${items.length - MAX_LINES} more` : 'wishlist';
    const refresh = document.createElement('a');
    refresh.textContent = data ? `refresh (${ago(data.at)})` : 'refresh';
    refresh.title = 'Refresh now';
    refresh.addEventListener('click', (e) => {
      e.preventDefault();
      load(user, true);
    });
    foot.append(more, refresh);
    div.appendChild(foot);

    box.append(h2, div);
  }

  function renderBadges(user, data) {
    if (location.pathname !== `/${user}/ulist` || !data) return;
    document.querySelectorAll('.vra-badge').forEach((b) => b.remove());
    const best = new Map();
    buildItems(data).forEach((item) => best.has(item.vid) || best.set(item.vid, item));
    const done = new Set();
    document.querySelectorAll('main a[href^="/v"]').forEach((a) => {
      const vid = a.getAttribute('href').match(/^\/(v\d+)$/)?.[1];
      const item = vid && best.get(vid);
      if (!item || done.has(vid) || !a.textContent.trim()) return;
      done.add(vid);
      const badge = document.createElement('span');
      badge.className = `vra-badge vra-${item.status}`;
      badge.title = statusText(item);
      badge.append(flags(item.langs), ` ${statusText(item)}`);
      a.insertAdjacentElement('afterend', badge);
    });
  }

  async function load(user, force = false) {
    const cache = GM_getValue(CACHE_KEY, null);
    const fresh = cache && cache.user === user && Date.now() - cache.at < TTL;
    if (fresh && !force) {
      renderSidebar(user, cache);
      renderBadges(user, cache);
      return;
    }
    renderSidebar(user, cache?.user === user ? cache : null);
    try {
      const data = await fetchData(user);
      GM_setValue(CACHE_KEY, data);
      renderSidebar(user, data);
      renderBadges(user, data);
    } catch (err) {
      renderSidebar(user, null, err.message);
    }
  }

  function init() {
    const user = myUserId();
    if (!user) return;

    GM_registerMenuCommand('Refresh releases', () => load(user, true));
    GM_registerMenuCommand('Tracked languages', () => {
      const input = prompt('Language codes separated by commas (empty = all):', getLangs().join(', '));
      if (input === null) return;
      GM_setValue(LANGS_KEY, input.split(/[\s,]+/).map((s) => s.trim().toLowerCase()).filter(Boolean));
      load(user);
    });

    load(user);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
