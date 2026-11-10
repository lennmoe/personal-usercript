// ==UserScript==
// @name         VNDB - Wishlist Release Alerts
// @namespace    vndb-wishlist-releases
// @version      1.7
// @description  Adds a "Wishlist releases" box to the VNDB sidebar: upcoming releases (date, month, year or TBA) and releases from the last 30 days for the VNs on your wishlist plus any VN you choose to watch, with language flags and platform icons, filtered by language (EN + JP by default, no MTL) and optionally by platform. On your list page (/u123/ulist), a badge with flag and date is shown next to each matching VN. Data comes from the VNDB API using your session, is cached for 6 hours and can be refreshed from the box. On a VN page, "+ Watch this VN" in the box adds it to the alerts (and "- Unwatch this VN" removes it); "Edit watched VNs" in the userscript manager menu lets you edit the list by ID. The menu also lets you set your user ID if it is not detected, choose the tracked languages and platforms (codes like win, swi, ps5) and force a refresh.
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

  const CACHE_KEY = 'releaseCacheV2';
  const LANGS_KEY = 'langs';
  const PLATS_KEY = 'platforms';
  const MAX_PLATS = 3;
  const EXTRA_KEY = 'extraVns';

  const currentVn = location.pathname.match(/^\/(v\d+)/)?.[1] || null;
  const getExtras = () => GM_getValue(EXTRA_KEY, []);
  const setExtras = (ids) => GM_setValue(EXTRA_KEY, [...new Set(ids)]);
  const extrasKey = () => [...getExtras()].sort().join(',');
  const TTL = 6 * 3600 * 1000;
  const RECENT_DAYS = 30;
  const SOON_DAYS = 30;
  const MAX_LINES = 8;
  const CHUNK = 50;

  const DAY = 86400000;
  const isoDay = (date) => date.toISOString().slice(0, 10);
  const todayKey = isoDay(new Date());

  const USER_KEY = 'userId';

  function userFromPage() {
    for (const a of document.querySelectorAll('a[href]')) {
      const href = a.getAttribute('href') || '';
      const m = href.match(/^(?:https?:\/\/vndb\.org)?\/(u\d+)\/?$/);
      if (m && /my profile/i.test(a.textContent)) return m[1];
    }
    for (const a of document.querySelectorAll('nav a[href], header a[href]')) {
      const m = (a.getAttribute('href') || '').match(/^(?:https?:\/\/vndb\.org)?\/(u\d+)(?:\/|$)/);
      if (m) return m[1];
    }
    return null;
  }

  function myUserId() {
    return userFromPage() || GM_getValue(USER_KEY, null);
  }

  function pageDiagnostic() {
    const navs = document.querySelectorAll('nav').length;
    const userLinks = [...document.querySelectorAll('a[href*="/u"]')].map((a) => a.getAttribute('href')).slice(0, 5);
    return `nav: ${navs}, links: ${userLinks.join(' ') || 'none'}`;
  }

  function askUserId() {
    const input = prompt('Your VNDB user ID (the number in your profile URL, e.g. u330078):', GM_getValue(USER_KEY, '') || '');
    if (input === null) return null;
    const id = input.trim().match(/u?(\d+)/)?.[1];
    GM_setValue(USER_KEY, id ? `u${id}` : null);
    return id ? `u${id}` : null;
  }

  const getLangs = () => GM_getValue(LANGS_KEY, ['en', 'ja']);
  const getPlats = () => GM_getValue(PLATS_KEY, []);

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
    const wishIds = Object.keys(titles);
    const extras = getExtras().filter((id) => !titles[id]);
    for (let i = 0; i < extras.length; i += CHUNK) {
      const chunk = extras.slice(i, i + CHUNK).map((id) => ['id', '=', id]);
      const vns = await paged('vn', { filters: chunk.length === 1 ? chunk[0] : ['or', ...chunk], fields: 'title' });
      vns.forEach((v) => (titles[v.id] = v.title));
    }
    const ids = Object.keys(titles);
    const since = isoDay(new Date(Date.now() - RECENT_DAYS * DAY));
    const releases = [];
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK).map((id) => ['id', '=', id]);
      const vnFilter = chunk.length === 1 ? chunk[0] : ['or', ...chunk];
      releases.push(
        ...(await paged('release', {
          filters: ['and', ['released', '>=', since], ['vn', '=', vnFilter]],
          fields: 'id, title, released, platforms, languages.lang, languages.mtl, vns.id',
          sort: 'released',
        }))
      );
    }
    return { at: Date.now(), user, extras: extrasKey(), wishIds, titles, releases };
  }

  function buildItems(data) {
    const langs = getLangs();
    const plats = getPlats();
    const byKey = new Map();
    data.releases.forEach((r) => {
      const relLangs = r.languages.filter((l) => !l.mtl && (!langs.length || langs.includes(l.lang))).map((l) => l.lang);
      if (!relLangs.length) return;
      const relPlats = (r.platforms || []).filter((p) => !plats.length || plats.includes(p));
      if (plats.length && !relPlats.length) return;
      const info = parseRelease(r.released);
      if (info.status === 'out' && info.key < isoDay(new Date(Date.now() - RECENT_DAYS * DAY))) return;
      r.vns.forEach(({ id }) => {
        if (!data.titles[id]) return;
        const k = `${id}|${info.key}`;
        const item = byKey.get(k) || { vid: id, title: data.titles[id], rid: r.id, langs: [], plats: [], ...info };
        relLangs.forEach((l) => item.langs.includes(l) || item.langs.push(l));
        relPlats.forEach((p) => item.plats.includes(p) || item.plats.push(p));
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
    #vra-box .vra-flags, #vra-box .vra-plats { flex: none; display: inline-flex; align-items: center; }
    .vra-plats small { font-size: 9px; color: var(--grayedout); margin-left: 1px; }
    .vra-badge .vra-plats { display: inline-flex; align-items: center; margin-left: 2px; vertical-align: middle; }
    #vra-box .vra-watch { margin-top: 3px; font-size: 11px; }
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

  function platIcons(plats, max = MAX_PLATS) {
    const span = document.createElement('span');
    span.className = 'vra-plats';
    plats.slice(0, max).forEach((p) => {
      const abbr = document.createElement('abbr');
      abbr.className = `icon-plat-${p}`;
      abbr.title = p;
      span.appendChild(abbr);
    });
    if (plats.length > max) {
      const more = document.createElement('small');
      more.textContent = `+${plats.length - max}`;
      more.title = plats.slice(max).join(', ');
      span.appendChild(more);
    }
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
    if (!nav) return log('sidebar not found');
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
      a.title = `${item.title} — ${statusText(item)}${item.plats?.length ? ` — ${item.plats.join(', ')}` : ''}`;
      const date = document.createElement('small');
      date.className = `vra-${item.status}`;
      date.textContent = item.status === 'out' ? 'out' : item.label;
      date.title = statusText(item);
      p.append(flags(item.langs), platIcons(item.plats || [], 2), a, date);
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

    if (currentVn && data) {
      const watch = document.createElement('p');
      watch.className = 'vra-watch';
      if (data.wishIds?.includes(currentVn)) {
        watch.className = 'vra-watch vra-dim';
        watch.textContent = 'This VN is on your wishlist';
      } else {
        const watched = getExtras().includes(currentVn);
        const a = document.createElement('a');
        a.textContent = watched ? '- Unwatch this VN' : '+ Watch this VN';
        a.title = watched ? 'Stop tracking releases of this VN' : 'Track releases of this VN even if it is not on your wishlist';
        a.addEventListener('click', (e) => {
          e.preventDefault();
          toggleWatch(user);
        });
        watch.appendChild(a);
      }
      div.appendChild(watch);
    }

    div.appendChild(foot);
    box.append(h2, div);
  }

  function toggleWatch(user) {
    if (!currentVn) return;
    const extras = getExtras();
    setExtras(extras.includes(currentVn) ? extras.filter((id) => id !== currentVn) : [...extras, currentVn]);
    load(user, true);
  }

  function editWatched(user) {
    const input = prompt(
      'VNs tracked in addition to your wishlist (IDs separated by commas, e.g. v17, v2002):',
      getExtras().join(', ')
    );
    if (input === null) return;
    setExtras((input.match(/v?\d+/gi) || []).map((s) => `v${s.replace(/^v/i, '')}`));
    load(user, true);
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
      badge.append(flags(item.langs), platIcons(item.plats || []), ` ${statusText(item)}`);
      a.insertAdjacentElement('afterend', badge);
    });
  }

  const log = (...args) => console.error('[Wishlist Release Alerts]', ...args);

  function safeRender(user, data, error) {
    try {
      renderSidebar(user, data, error);
      renderBadges(user, data);
    } catch (err) {
      log(err);
    }
  }

  async function load(user, force = false) {
    const cache = GM_getValue(CACHE_KEY, null);
    const fresh = cache && cache.user === user && cache.extras === extrasKey() && Date.now() - cache.at < TTL;
    if (fresh && !force) return safeRender(user, cache);
    safeRender(user, cache?.user === user ? cache : null);
    try {
      const data = await fetchData(user);
      GM_setValue(CACHE_KEY, data);
      safeRender(user, data);
    } catch (err) {
      log(err);
      safeRender(user, null, err.message || String(err));
    }
  }

  function showMessage(text, detail) {
    const nav = document.querySelector('body > nav') || document.querySelector('#support')?.parentElement;
    if (!nav) return;
    document.getElementById('vra-box')?.remove();
    const box = document.createElement('article');
    box.id = 'vra-box';
    const h2 = document.createElement('h2');
    h2.textContent = 'Wishlist releases';
    const div = document.createElement('div');
    const p = document.createElement('p');
    p.textContent = text;
    div.appendChild(p);
    const set = document.createElement('a');
    set.textContent = 'Set my user ID';
    set.addEventListener('click', (e) => {
      e.preventDefault();
      const user = askUserId();
      if (user) {
        box.remove();
        load(user, true);
      }
    });
    div.appendChild(set);
    if (detail) {
      const small = document.createElement('p');
      small.className = 'vra-dim';
      small.style.fontSize = '10px';
      small.style.wordBreak = 'break-all';
      small.textContent = detail;
      div.appendChild(small);
    }
    box.append(h2, div);
    nav.appendChild(box);
  }

  function withUser(fn) {
    const user = myUserId() || askUserId();
    if (user) fn(user);
  }

  GM_registerMenuCommand('Set my user ID', () => {
    const user = askUserId();
    if (user) load(user, true);
  });
  GM_registerMenuCommand('Refresh releases', () => withUser((user) => load(user, true)));
  if (currentVn) GM_registerMenuCommand('Watch / unwatch this VN', () => withUser(toggleWatch));
  GM_registerMenuCommand('Edit watched VNs', () => withUser(editWatched));
  GM_registerMenuCommand('Tracked languages', () => {
    const input = prompt('Language codes separated by commas (empty = all):', getLangs().join(', '));
    if (input === null) return;
    GM_setValue(LANGS_KEY, input.split(/[\s,]+/).map((s) => s.trim().toLowerCase()).filter(Boolean));
    withUser((user) => load(user));
  });
  GM_registerMenuCommand('Tracked platforms', () => {
    const input = prompt('Platform codes separated by commas, e.g. win, swi, ps5 (empty = all):', getPlats().join(', '));
    if (input === null) return;
    GM_setValue(PLATS_KEY, input.split(/[\s,]+/).map((s) => s.trim().toLowerCase()).filter(Boolean));
    withUser((user) => load(user));
  });

  function waitForUser(timeout = 10000) {
    return new Promise((resolve) => {
      const found = myUserId();
      if (found) return resolve(found);
      const observer = new MutationObserver(() => {
        const user = myUserId();
        if (user) {
          observer.disconnect();
          clearTimeout(timer);
          resolve(user);
        }
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
      const timer = setTimeout(() => {
        observer.disconnect();
        resolve(myUserId());
      }, timeout);
    });
  }

  async function init() {
    try {
      const user = await waitForUser();
      if (!user) {
        if (document.querySelector('a[href^="/u/login"]')) return;
        return showMessage('Could not find your profile link.', pageDiagnostic());
      }
      load(user);
    } catch (err) {
      showMessage(`Error: ${err.message || err}`);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
