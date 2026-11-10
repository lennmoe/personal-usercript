// ==UserScript==
// @name         VNDB - Tags Highlight
// @namespace    vndb-tags-highlight
// @version      1.1
// @description  Surligne en vert les tags que tu aimes et en rouge ceux à éviter, sur la fiche VN et sur la page /tags. Shift+clic sur un tag pour passer de neutre → aimé → à éviter → neutre ; sur une page de tag (/g123), des boutons font la même chose. Sous la cover de la fiche, une case affiche ta compatibilité en % : 50% de base, jusqu'à +50% selon la note (0–3) de tes tags aimés présents (objectif = min(tags aimés, 5) tags notés 3.0), et −35% par tag à éviter noté 3.0 (proportionnel à la note). Les tags spoiler majeur comptent dans le score mais leur nom est masqué. Le menu du gestionnaire de scripts permet de voir, exporter, importer ou vider les listes.
// @author       lennmoe
// @homepageURL  https://github.com/lennmoe/personal-usercript
// @downloadURL  https://github.com/lennmoe/personal-usercript/raw/main/vndb/VNDB%20Tags%20Highlight.user.js
// @updateURL    https://github.com/lennmoe/personal-usercript/raw/main/vndb/VNDB%20Tags%20Highlight.user.js
// @match        https://vndb.org/v*
// @match        https://vndb.org/g*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function () {
  'use strict';

  const STORE_KEY = 'tagLists';
  const LIKE_TARGET = 5;
  const AVOID_PENALTY = 35;
  const MAX_LISTED = 8;

  function load() {
    const data = GM_getValue(STORE_KEY, null);
    return { liked: data?.liked || {}, avoided: data?.avoided || {} };
  }

  function save(lists) {
    GM_setValue(STORE_KEY, lists);
  }

  function stateOf(lists, id) {
    if (lists.liked[id]) return 'liked';
    if (lists.avoided[id]) return 'avoided';
    return 'none';
  }

  function setState(id, name, state) {
    const lists = load();
    delete lists.liked[id];
    delete lists.avoided[id];
    if (state === 'liked') lists.liked[id] = name;
    if (state === 'avoided') lists.avoided[id] = name;
    save(lists);
  }

  GM_addStyle(`
    .vth-liked { background: rgba(60, 180, 90, 0.28); border-radius: 3px; padding: 0 3px; outline: 1px solid rgba(60, 180, 90, 0.6); }
    .vth-avoided { background: rgba(220, 60, 60, 0.28); border-radius: 3px; padding: 0 3px; outline: 1px solid rgba(220, 60, 60, 0.6); }
    tr.vth-row-liked > td { background: rgba(60, 180, 90, 0.10) !important; }
    tr.vth-row-avoided > td { background: rgba(220, 60, 60, 0.10) !important; }
    .vth-summary { margin: 0 0 6px; font-size: 0.95em; }
    .vth-summary b { margin-right: 4px; }
    .vth-ok { color: #5cc77a; }
    .vth-bad { color: #e86464; }
    .vth-dim { opacity: 0.6; }
    .vth-btns { margin: 8px 0; display: flex; gap: 8px; }
    .vth-btns button { cursor: pointer; padding: 2px 10px; }
    .vth-btns button.vth-active { font-weight: bold; text-decoration: underline; }
    .vth-box { margin: 10px auto 0; padding: 8px 10px; border: 1px solid rgba(128, 160, 200, 0.35); border-radius: 4px; background: rgba(0, 0, 0, 0.18); text-align: left; box-sizing: border-box; }
    .vth-box-head { display: flex; justify-content: space-between; align-items: baseline; }
    .vth-box-head b { font-size: 1.5em; }
    .vth-bar { height: 6px; margin: 4px 0 2px; border-radius: 3px; background: rgba(128, 128, 128, 0.25); overflow: hidden; }
    .vth-bar > div { height: 100%; border-radius: 3px; }
    .vth-verdict { font-size: 0.95em; margin-bottom: 6px; }
    .vth-box ul { list-style: none; margin: 4px 0; padding: 0; }
    .vth-box li { display: flex; justify-content: space-between; gap: 6px; line-height: 1.5; }
    .vth-box li span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .vth-box li small { opacity: 0.6; flex: none; }
    .vth-foot { margin-top: 6px; font-size: 0.85em; opacity: 0.6; }
  `);

  const tagIdFromHref = (href) => href?.match(/^\/(g\d+)(?:[/?#]|$)/)?.[1] || null;

  function collectTags(container) {
    return [...container.querySelectorAll('a[href^="/g"]')]
      .map((a) => {
        const id = tagIdFromHref(a.getAttribute('href'));
        if (!id) return null;
        const wrap = a.closest('[class*="tagspl"]');
        const spoiler = Number(wrap?.className.match(/tagspl(\d)/)?.[1] || 0);
        const ratingText = a.nextElementSibling?.matches('small') ? a.nextElementSibling.textContent : '';
        const rating = parseFloat(ratingText) || 0;
        return { a, id, name: a.textContent.trim(), rating, spoiler };
      })
      .filter(Boolean);
  }

  function findVnContainer() {
    if (/^\/v\d+\/tags/.test(location.pathname)) {
      return [...document.querySelectorAll('article')].find((art) =>
        [...art.querySelectorAll('a[href^="/g"]')].some((a) => tagIdFromHref(a.getAttribute('href')))
      );
    }
    return document.getElementById('vntags');
  }

  function renderHighlights(tags, lists) {
    tags.forEach(({ a, id }) => {
      const state = stateOf(lists, id);
      a.classList.toggle('vth-liked', state === 'liked');
      a.classList.toggle('vth-avoided', state === 'avoided');
      const tr = a.closest('tr');
      if (tr) {
        tr.classList.toggle('vth-row-liked', state === 'liked');
        tr.classList.toggle('vth-row-avoided', state === 'avoided');
      }
    });
  }

  function uniqueByState(tags, lists, state) {
    const seen = new Set();
    return tags.filter((t) => stateOf(lists, t.id) === state && !seen.has(t.id) && seen.add(t.id));
  }

  function renderSummary(container, liked, avoided) {
    let summary = document.getElementById('vth-summary');
    if (!summary) {
      summary = document.createElement('div');
      summary.id = 'vth-summary';
      summary.className = 'vth-summary';
      const table = container.tagName === 'ARTICLE' ? container.querySelector('table') : null;
      if (table) table.parentNode.insertBefore(summary, table);
      else container.parentNode.insertBefore(summary, container);
    }
    summary.replaceChildren();

    const part = (cls, icon, list) => {
      const s = document.createElement('span');
      s.className = cls;
      s.title = list.map((t) => (t.spoiler >= 2 ? '(spoiler)' : t.name)).join(', ');
      s.textContent = `${icon} ${list.length}`;
      return s;
    };
    const label = document.createElement('b');
    label.textContent = 'Tags perso :';
    summary.append(label, part('vth-ok', '♥', liked), ' · ', part('vth-bad', '✕', avoided));
    if (!liked.length && !avoided.length) {
      const hint = document.createElement('span');
      hint.className = 'vth-dim';
      hint.textContent = ' (Shift+clic sur un tag pour le classer)';
      summary.append(hint);
    }
  }

  function computeScore(liked, avoided, lists) {
    const likedCount = Object.keys(lists.liked).length;
    const target = Math.min(likedCount, LIKE_TARGET);
    const pos = liked.reduce((s, t) => s + t.rating / 3, 0);
    const neg = avoided.reduce((s, t) => s + t.rating / 3, 0);
    const bonus = target ? 50 * Math.min(1, pos / target) : 0;
    return Math.max(0, Math.min(100, Math.round(50 + bonus - AVOID_PENALTY * neg)));
  }

  function verdict(score) {
    if (score >= 80) return 'Fait pour toi';
    if (score >= 60) return 'Tu devrais aimer';
    if (score >= 40) return 'Mitigé';
    if (score >= 20) return 'Probablement pas pour toi';
    return 'À éviter';
  }

  function tagList(cls, icon, list) {
    const ul = document.createElement('ul');
    const sorted = [...list].sort((x, y) => y.rating - x.rating);
    sorted.slice(0, MAX_LISTED).forEach((t) => {
      const li = document.createElement('li');
      const name = document.createElement('span');
      name.className = cls;
      name.textContent = `${icon} ${t.spoiler >= 2 ? 'spoiler majeur' : t.name}`;
      name.title = t.spoiler >= 2 ? '' : t.name;
      const rating = document.createElement('small');
      rating.textContent = t.rating ? t.rating.toFixed(1) : '';
      li.append(name, rating);
      ul.appendChild(li);
    });
    if (sorted.length > MAX_LISTED) {
      const li = document.createElement('li');
      li.className = 'vth-dim';
      li.textContent = `+${sorted.length - MAX_LISTED} autres`;
      ul.appendChild(li);
    }
    return ul;
  }

  function renderScoreBox(liked, avoided, lists) {
    const host = document.querySelector('.vnimg');
    if (!host) return;

    let box = document.getElementById('vth-box');
    if (!box) {
      box = document.createElement('div');
      box.id = 'vth-box';
      box.className = 'vth-box';
      host.appendChild(box);
    }
    box.style.maxWidth = (host.querySelector('.imghover')?.offsetWidth || 256) + 'px';
    box.replaceChildren();

    const likedTotal = Object.keys(lists.liked).length;
    if (!likedTotal && !Object.keys(lists.avoided).length) {
      box.className = 'vth-box vth-dim';
      box.textContent = 'Shift+clic sur des tags pour les classer et voir ta compatibilité.';
      return;
    }
    box.className = 'vth-box';

    const score = computeScore(liked, avoided, lists);
    const color = `hsl(${Math.round(score * 1.2)}, 60%, 50%)`;

    const head = document.createElement('div');
    head.className = 'vth-box-head';
    const title = document.createElement('span');
    title.textContent = 'Compatibilité';
    const pct = document.createElement('b');
    pct.textContent = `${score}%`;
    pct.style.color = color;
    head.append(title, pct);

    const bar = document.createElement('div');
    bar.className = 'vth-bar';
    const fill = document.createElement('div');
    fill.style.width = `${score}%`;
    fill.style.background = color;
    bar.appendChild(fill);

    const v = document.createElement('div');
    v.className = 'vth-verdict';
    v.textContent = verdict(score);

    box.append(head, bar, v);
    if (liked.length) box.appendChild(tagList('vth-ok', '♥', liked));
    if (avoided.length) box.appendChild(tagList('vth-bad', '✕', avoided));

    const foot = document.createElement('div');
    foot.className = 'vth-foot';
    foot.textContent = `${liked.length}/${likedTotal} tags aimés présents · ${avoided.length} à éviter`;
    box.appendChild(foot);
  }

  function renderVnPage() {
    const container = findVnContainer();
    if (!container) return;
    const lists = load();
    const tags = collectTags(container);
    const liked = uniqueByState(tags, lists, 'liked');
    const avoided = uniqueByState(tags, lists, 'avoided');

    renderHighlights(tags, lists);
    renderSummary(container, liked, avoided);
    if (container.id === 'vntags') renderScoreBox(liked, avoided, lists);
  }

  function initVnPage() {
    const container = findVnContainer();
    if (!container) return;

    container.addEventListener(
      'click',
      (e) => {
        if (!e.shiftKey) return;
        const a = e.target.closest('a[href^="/g"]');
        const id = a && tagIdFromHref(a.getAttribute('href'));
        if (!id) return;
        e.preventDefault();
        e.stopPropagation();
        const next = { none: 'liked', liked: 'avoided', avoided: 'none' }[stateOf(load(), id)];
        setState(id, a.textContent.trim(), next);
        renderVnPage();
      },
      true
    );

    renderVnPage();
    let pending = false;
    new MutationObserver((mutations) => {
      if (pending || mutations.every((m) => m.target.closest?.('#vth-summary, #vth-box'))) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        renderVnPage();
      });
    }).observe(container, { childList: true, subtree: true });
  }

  function initTagPage(id) {
    const h1 = document.querySelector('main h1, article h1, h1');
    if (!h1) return;
    const name = h1.textContent.replace(/^Tag:\s*/i, '').trim();

    const box = document.createElement('div');
    box.className = 'vth-btns';
    const makeBtn = (state, text) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.state = state;
      b.textContent = text;
      b.addEventListener('click', () => {
        setState(id, name, stateOf(load(), id) === state ? 'none' : state);
        refresh();
      });
      return b;
    };
    const btns = [makeBtn('liked', '♥ J\'aime'), makeBtn('avoided', '✕ À éviter')];
    box.append(...btns);
    h1.insertAdjacentElement('afterend', box);

    function refresh() {
      const current = stateOf(load(), id);
      btns.forEach((b) => b.classList.toggle('vth-active', b.dataset.state === current));
      h1.classList.toggle('vth-liked', current === 'liked');
      h1.classList.toggle('vth-avoided', current === 'avoided');
    }
    refresh();
  }

  GM_registerMenuCommand('Voir mes tags', () => {
    const { liked, avoided } = load();
    const fmt = (o) => Object.entries(o).map(([id, n]) => `  ${n} (${id})`).join('\n') || '  (aucun)';
    alert(`♥ Aimés :\n${fmt(liked)}\n\n✕ À éviter :\n${fmt(avoided)}`);
  });

  GM_registerMenuCommand('Exporter les tags (JSON)', () => {
    prompt('Copie ce JSON :', JSON.stringify(load()));
  });

  GM_registerMenuCommand('Importer des tags (JSON)', () => {
    const raw = prompt('Colle le JSON exporté :');
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      save({ liked: data.liked || {}, avoided: data.avoided || {} });
      location.reload();
    } catch {
      alert('JSON invalide.');
    }
  });

  GM_registerMenuCommand('Vider les listes', () => {
    if (confirm('Supprimer tous les tags aimés et à éviter ?')) {
      save({ liked: {}, avoided: {} });
      location.reload();
    }
  });

  function init() {
    const path = location.pathname;
    const tag = path.match(/^\/(g\d+)$/);
    if (/^\/v\d+(?:\/tags)?$/.test(path)) initVnPage();
    else if (tag) initTagPage(tag[1]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
