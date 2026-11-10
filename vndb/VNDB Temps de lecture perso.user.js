// ==UserScript==
// @name         VNDB - Temps de lecture perso
// @namespace    vndb-reading-time
// @version      1.1
// @description  Ajoute une ligne "Temps perso" sur les fiches VNDB : chrono ▶/⏸ en temps réel qui continue même si l'onglet est fermé (une seule session active à la fois), temps lu, estimation perso, % de progression, temps restant et date de fin estimée selon ton rythme (heures de lecture par jour, réglable en cliquant dessus). Marque un VN comme terminé pour calibrer ta vitesse : vitesse perso = caractères lus (jiten.moe) / heures réelles sur tes VN terminés ; sinon ratio entre ton temps réel et la moyenne VNDB. Avant calibration : 14 000 car/h ou moyenne VNDB. "✎" permet de saisir ou corriger le temps (3h20, 45m, 3:20, +30m, -15m). Sur tes pages de liste (/u123/ulist), un planning enchaîne tes VN "Playing" puis ta wishlist et donne la date de fin de chacun à ton rythme. Le menu du gestionnaire de scripts affiche tes stats, règle le rythme, fixe une vitesse manuelle, exporte et importe les données.
// @author       lennmoe
// @homepageURL  https://github.com/lennmoe/personal-usercript
// @downloadURL  https://github.com/lennmoe/personal-usercript/raw/main/vndb/VNDB%20Temps%20de%20lecture%20perso.user.js
// @updateURL    https://github.com/lennmoe/personal-usercript/raw/main/vndb/VNDB%20Temps%20de%20lecture%20perso.user.js
// @match        https://vndb.org/v*
// @match        https://vndb.org/u*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @grant        GM_addValueChangeListener
// @connect      api.jiten.moe
// ==/UserScript==

(function () {
  'use strict';

  const KEY = 'readData';
  const DEFAULT_SPEED = 14000;
  const DEFAULT_HOURS_PER_DAY = 2;
  const LENGTH_FALLBACK_MIN = { 1: 60, 2: 360, 3: 1200, 4: 2400, 5: 3600 };
  const PLAN_MAX_ROWS = 30;

  const vnId = location.pathname.match(/^\/(v\d+)$/)?.[1];
  const ulistUser = location.pathname.match(/^\/(u\d+)\/ulist$/)?.[1];

  function load() {
    const d = GM_getValue(KEY, null) || {};
    return { manualSpeed: d.manualSpeed || null, hoursPerDay: d.hoursPerDay || null, vns: d.vns || {} };
  }

  const hoursPerDay = (d) => d.hoursPerDay || DEFAULT_HOURS_PER_DAY;

  function finishDate(ms, d) {
    const days = Math.max(1, Math.ceil(ms / (hoursPerDay(d) * 3.6e6)));
    return new Date(Date.now() + (days - 1) * 86400000);
  }

  function fmtDate(date) {
    const sameYear = date.getFullYear() === new Date().getFullYear();
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
  }

  function fmtPace(d) {
    const h = hoursPerDay(d);
    return `${fmt(h * 3.6e6)}/jour${d.hoursPerDay ? '' : ' (défaut)'}`;
  }

  function setHoursPerDay() {
    const d = load();
    const input = prompt(`Combien de temps tu lis par jour ? (3h, 1h30, 45m)\nActuel : ${fmtPace(d)}`, d.hoursPerDay ? fmt(d.hoursPerDay * 3.6e6) : '');
    if (input === null) return;
    const p = input.trim() ? parseDuration(/^\d+([.,]\d+)?$/.test(input.trim()) ? input.trim() + 'h' : input) : { ms: 0 };
    if (!p) return alert('Format non reconnu.');
    d.hoursPerDay = p.ms > 0 ? p.ms / 3.6e6 : null;
    save(d);
    refreshAll();
  }

  async function api(path, body) {
    const res = await fetch(`https://api.vndb.org/kana/${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    return res.json();
  }

  async function fetchUlist(user, label) {
    const out = [];
    for (let page = 1; page <= 10; page++) {
      const r = await api('ulist', {
        user,
        filters: ['label', '=', label],
        fields: 'vn.title, vn.length_minutes, vn.length',
        sort: 'lastmod',
        reverse: true,
        results: 100,
        page,
      });
      out.push(...r.results);
      if (!r.more) break;
    }
    return out;
  }

  function save(d) {
    GM_setValue(KEY, d);
  }

  const elapsed = (e) => (e?.ms || 0) + (e?.start ? Date.now() - e.start : 0);

  function fmt(ms, withSeconds = false) {
    const totalSec = Math.max(0, Math.round(ms / 1000));
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const pad = (n) => String(n).padStart(2, '0');
    if (withSeconds) return h ? `${h}h ${pad(m)}m ${pad(s)}s` : `${m}m ${pad(s)}s`;
    if (!h) return `${m}m`;
    return m ? `${h}h ${pad(m)}m` : `${h}h`;
  }

  const fmtNum = (n) => Math.round(n).toLocaleString('fr-FR');

  function parseDuration(input) {
    const raw = input.trim().toLowerCase().replace(/\s+/g, '');
    const sign = raw.startsWith('+') ? 1 : raw.startsWith('-') ? -1 : 0;
    const body = sign ? raw.slice(1) : raw;
    let min = null;
    let m;
    if ((m = body.match(/^(\d+):(\d{1,2})$/))) min = +m[1] * 60 + +m[2];
    else if ((m = body.match(/^(?:(\d+(?:[.,]\d+)?)h)?(?:(\d+)m?)?$/)) && (m[1] || m[2]))
      min = parseFloat((m[1] || '0').replace(',', '.')) * 60 + +(m[2] || 0);
    if (min === null) return null;
    return { relative: sign !== 0, ms: (sign || 1) * min * 60000 };
  }

  function calibration(d) {
    const done = Object.values(d.vns).filter((e) => e.done && elapsed(e) > 0);
    const withChars = done.filter((e) => e.chars);
    const hours = withChars.reduce((s, e) => s + elapsed(e) / 3.6e6, 0);
    const autoSpeed = hours > 0 ? withChars.reduce((s, e) => s + e.chars, 0) / hours : null;
    const withVndb = done.filter((e) => e.vndbMin);
    const vndbTotal = withVndb.reduce((s, e) => s + e.vndbMin, 0);
    const ratio = vndbTotal ? withVndb.reduce((s, e) => s + elapsed(e) / 60000, 0) / vndbTotal : null;
    return {
      speed: d.manualSpeed || autoSpeed,
      speedLabel: d.manualSpeed ? 'manuelle' : autoSpeed ? `${withChars.length} VN` : null,
      ratio,
      ratioCount: withVndb.length,
    };
  }

  function estimate(chars, vndbMin, cal) {
    if (chars && cal.speed)
      return { ms: (chars / cal.speed) * 3.6e6, src: `ta vitesse ${fmtNum(cal.speed)} car/h (${cal.speedLabel})` };
    if (vndbMin && cal.ratio)
      return { ms: vndbMin * cal.ratio * 60000, src: `moyenne VNDB × ${cal.ratio.toFixed(2)} (${cal.ratioCount} VN)` };
    if (chars) return { ms: (chars / DEFAULT_SPEED) * 3.6e6, src: `vitesse par défaut ${fmtNum(DEFAULT_SPEED)} car/h` };
    if (vndbMin) return { ms: vndbMin * 60000, src: 'moyenne VNDB' };
    return null;
  }

  function findRow(label) {
    return [...document.querySelectorAll('tr')].find((tr) => tr.querySelector('td')?.textContent.trim() === label);
  }

  function readVndbMinutes() {
    const text = findRow('Play time')?.querySelectorAll('td')[1]?.textContent || '';
    const m = text.match(/\((?:(\d+)h)?\s*(?:(\d+)m)?\s+from/);
    if (!m || (!m[1] && !m[2])) return null;
    return +(m[1] || 0) * 60 + +(m[2] || 0);
  }

  function fetchJson(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        onload: (res) => {
          try {
            resolve(JSON.parse(res.responseText));
          } catch (e) {
            reject(e);
          }
        },
        onerror: reject,
      });
    });
  }

  async function fetchChars() {
    try {
      const ids = await fetchJson(`https://api.jiten.moe/api/media-deck/by-link-id/2/${vnId}`);
      if (!Array.isArray(ids) || !ids.length) return null;
      const detail = await fetchJson(`https://api.jiten.moe/api/media-deck/${ids[0]}/detail`);
      return detail?.data?.mainDeck?.characterCount || null;
    } catch {
      return null;
    }
  }

  GM_addStyle(`
    #vrt-row .vrt-btn { margin-right: 6px; }
    #vrt-row .vrt-btn.vrt-on { font-weight: bold; color: var(--statok); }
    #vrt-row .vrt-read { font-weight: bold; font-variant-numeric: tabular-nums; }
    .vrt-dim { color: var(--grayedout); }
    #vrt-row .vrt-bar { height: 4px; max-width: 260px; margin: 3px 0; background: var(--secbg); }
    #vrt-row .vrt-bar > div { height: 100%; background: var(--statok); }
    #vrt-row .vrt-sub { color: var(--grayedout); font-size: 11px; }
    #vrt-plan { margin: 8px 0 12px; border: 1px solid var(--border); background: var(--boxbg); }
    #vrt-plan > summary { padding: 2px 6px; cursor: pointer; font-weight: bold; }
    #vrt-plan[open] > summary { border-bottom: 1px solid var(--border); }
    #vrt-plan > summary a { font-weight: normal; }
    #vrt-plan .vrt-plan-body { padding: 4px 6px; }
    #vrt-plan table { width: 100%; }
    #vrt-plan thead td { font-weight: bold; }
    #vrt-plan td { padding: 1px 6px; white-space: nowrap; }
    #vrt-plan td.vrt-plan-title { white-space: normal; width: 100%; }
    #vrt-plan td.vrt-plan-group { font-style: italic; color: var(--grayedout); padding-top: 5px; }
  `);

  let chars = null;
  let vndbMin = null;
  let els = null;

  function entry(d) {
    const e = (d.vns[vnId] ||= { title: document.querySelector('h1')?.textContent.trim() || vnId, ms: 0, start: null });
    if (chars) e.chars = chars;
    if (vndbMin) e.vndbMin = vndbMin;
    return e;
  }

  function stopAll(d) {
    Object.values(d.vns).forEach((e) => {
      if (e.start) {
        e.ms = elapsed(e);
        e.start = null;
      }
    });
  }

  function toggle() {
    const d = load();
    const e = entry(d);
    if (e.start) {
      e.ms = elapsed(e);
      e.start = null;
    } else {
      stopAll(d);
      e.start = Date.now();
      e.done = false;
    }
    save(d);
    update();
  }

  function editTime() {
    const d = load();
    const e = entry(d);
    const input = prompt(`Temps lu actuel : ${fmt(elapsed(e))}\nNouveau temps (3h20, 45m, 3:20) ou ajustement (+30m, -15m) :`);
    if (!input) return;
    const p = parseDuration(input);
    if (!p) return alert('Format non reconnu.');
    const base = p.relative ? elapsed(e) : 0;
    e.ms = Math.max(0, base + p.ms);
    if (e.start) e.start = Date.now();
    save(d);
    update();
  }

  function toggleDone() {
    const d = load();
    const e = entry(d);
    if (!e.done && !elapsed(e)) return editTime();
    if (e.start) {
      e.ms = elapsed(e);
      e.start = null;
    }
    e.done = !e.done;
    e.doneAt = e.done ? Date.now() : null;
    save(d);
    update();
  }

  function link(text, onClick) {
    const a = document.createElement('a');
    a.textContent = text;
    a.addEventListener('click', (ev) => {
      ev.preventDefault();
      onClick();
    });
    return a;
  }

  function buildRow() {
    const tr = document.createElement('tr');
    tr.id = 'vrt-row';
    const tdL = document.createElement('td');
    tdL.textContent = 'Temps perso';
    const tdV = document.createElement('td');

    const main = document.createElement('div');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'vrt-btn';
    btn.addEventListener('click', toggle);
    const read = document.createElement('span');
    read.className = 'vrt-read';
    const info = document.createElement('span');
    info.className = 'vrt-dim';
    main.append(btn, read, info);

    const bar = document.createElement('div');
    bar.className = 'vrt-bar';
    const fill = document.createElement('div');
    bar.appendChild(fill);

    const sub = document.createElement('div');
    sub.className = 'vrt-sub';
    const plan = document.createElement('div');
    const planText = document.createElement('span');
    const paceLink = link('', setHoursPerDay);
    paceLink.title = 'Changer ton rythme de lecture';
    plan.append(planText, ' à ', paceLink);

    const subText = document.createElement('span');
    const editLink = link('✎ modifier', editTime);
    const doneLink = link('', toggleDone);
    sub.append(subText, ' · ', editLink, ' · ', doneLink);

    tdV.append(main, bar, plan, sub);
    tr.append(tdL, tdV);
    els = { tr, btn, read, info, bar, fill, plan, planText, paceLink, subText, doneLink };
    return tr;
  }

  function update() {
    if (!els) return;
    const d = load();
    const e = d.vns[vnId];
    const cal = calibration(d);
    const est = estimate(chars, vndbMin, cal);
    const ms = elapsed(e);
    const running = !!e?.start;

    els.btn.textContent = running ? '⏸ Pause' : ms ? '▶ Reprendre' : '▶ Commencer';
    els.btn.classList.toggle('vrt-on', running);
    els.btn.hidden = !!e?.done;
    els.doneLink.textContent = e?.done ? '↺ pas fini' : '✓ terminé';

    els.plan.hidden = !!e?.done || !est;
    if (est && !e?.done) {
      const remaining = Math.max(0, est.ms - ms);
      const days = Math.max(1, Math.ceil(remaining / (hoursPerDay(d) * 3.6e6)));
      els.planText.textContent = `📅 Fini vers le ${fmtDate(finishDate(remaining, d))} (${days} jour${days > 1 ? 's' : ''})`;
      els.paceLink.textContent = fmtPace(d);
    }

    if (e?.done) {
      els.read.textContent = `✓ Terminé en ${fmt(ms)}`;
      const parts = [];
      if (vndbMin) parts.push(`VNDB ${fmt(vndbMin * 60000)} → toi ×${(ms / 60000 / vndbMin).toFixed(2)}`);
      if (chars && ms) parts.push(`${fmtNum(chars / (ms / 3.6e6))} car/h sur ce VN`);
      els.info.textContent = '';
      els.bar.hidden = true;
      els.subText.textContent = parts.join(' · ') || 'Ajoute-le à tes stats';
      return;
    }

    els.read.textContent = ms || running ? fmt(ms, running) : '';
    const infoParts = [];
    if (ms || running) infoParts.push(' lu');
    if (est) infoParts.push(`${ms || running ? ' · ' : ''}~${fmt(est.ms)} estimé`);
    let pct = null;
    if (est && ms) {
      pct = Math.min(100, (ms / est.ms) * 100);
      infoParts.push(` · ${Math.round(pct)}%`);
    }
    els.info.textContent = infoParts.join('');

    els.bar.hidden = pct === null;
    if (pct !== null) els.fill.style.width = `${pct}%`;

    const subParts = [];
    if (est && ms) subParts.push(ms < est.ms ? `reste ~${fmt(est.ms - ms)}` : `+${fmt(ms - est.ms)} au-delà de l'estimation`);
    if (est) subParts.push(est.src);
    else subParts.push('pas de données de longueur');
    const other = Object.entries(d.vns).find(([id, o]) => id !== vnId && o.start);
    if (other) subParts.push(`⏱ session en cours : ${other[1].title}`);
    els.subText.textContent = subParts.join(' · ');
  }

  function placeRow(tr) {
    const anchor =
      document.getElementById('jiten-playtime-row') ||
      document.getElementById('jiten-charcount-row') ||
      findRow('Play time') ||
      findRow('Release Dates');
    if (anchor) anchor.parentNode.insertBefore(tr, anchor.nextSibling);
    else document.querySelector('.vnimg + table, article table')?.appendChild(tr);
  }

  GM_registerMenuCommand('Mes stats de lecture', () => {
    const d = load();
    const all = Object.values(d.vns);
    const total = all.reduce((s, e) => s + elapsed(e), 0);
    const done = all.filter((e) => e.done);
    const cal = calibration(d);
    const running = all.find((e) => e.start);
    const lines = [
      `Temps total : ${fmt(total)}`,
      `VN suivis : ${all.length} · terminés : ${done.length}`,
      `Vitesse : ${cal.speed ? `${fmtNum(cal.speed)} car/h (${cal.speedLabel})` : 'pas encore calibrée'}`,
      `Ratio vs VNDB : ${cal.ratio ? `×${cal.ratio.toFixed(2)} (${cal.ratioCount} VN)` : '—'}`,
      running ? `Session en cours : ${running.title} (${fmt(elapsed(running))})` : 'Aucune session en cours',
      '',
      ...all
        .sort((a, b) => elapsed(b) - elapsed(a))
        .slice(0, 15)
        .map((e) => `${e.done ? '✓' : e.start ? '⏱' : '·'} ${e.title} — ${fmt(elapsed(e))}`),
    ];
    alert(lines.join('\n'));
  });

  GM_registerMenuCommand('Rythme de lecture (temps par jour)', setHoursPerDay);

  GM_registerMenuCommand('Vitesse manuelle (car/h)', () => {
    const d = load();
    const input = prompt('Vitesse en caractères/heure (vide = calcul auto) :', d.manualSpeed || '');
    if (input === null) return;
    const n = parseInt(input.replace(/\D/g, ''), 10);
    d.manualSpeed = n > 0 ? n : null;
    save(d);
    refreshAll();
  });

  GM_registerMenuCommand('Exporter les données (JSON)', () => {
    prompt('Copie ce JSON :', JSON.stringify(load()));
  });

  GM_registerMenuCommand('Importer des données (JSON)', () => {
    const raw = prompt('Colle le JSON exporté :');
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      save({ manualSpeed: data.manualSpeed || null, hoursPerDay: data.hoursPerDay || null, vns: data.vns || {} });
      refreshAll();
    } catch {
      alert('JSON invalide.');
    }
  });

  let planState = null;

  function myUserId() {
    const a = [...document.querySelectorAll('body > nav a[href^="/u"]')].find((x) => x.textContent.trim() === 'My Profile');
    return a?.getAttribute('href').match(/^\/(u\d+)$/)?.[1] || null;
  }

  function planEstimate(id, vn, d, cal) {
    const e = d.vns[id];
    const est = estimate(e?.chars, vn.length_minutes || e?.vndbMin, cal);
    if (est) return est.ms;
    if (vn.length) return LENGTH_FALLBACK_MIN[vn.length] * 60000 * (cal.ratio || 1);
    return null;
  }

  function buildPlan(playing, wishlist, d) {
    const cal = calibration(d);
    const daily = hoursPerDay(d) * 3.6e6;
    const progress = (id) => elapsed(d.vns[id]);
    const sortedPlaying = [...playing].sort(
      (a, b) => !!d.vns[b.id]?.start - !!d.vns[a.id]?.start || progress(b.id) - progress(a.id)
    );
    let cursor = 0;
    const rows = [];
    const add = (item, group) => {
      const e = d.vns[item.id];
      if (e?.done) return;
      const est = planEstimate(item.id, item.vn, d, cal);
      const read = progress(item.id);
      const remaining = est === null ? null : Math.max(0, est - read);
      if (remaining !== null) cursor += remaining;
      rows.push({
        id: item.id,
        title: item.vn.title,
        group,
        read,
        remaining,
        running: !!e?.start,
        end: remaining === null ? null : new Date(Date.now() + (Math.max(1, Math.ceil(cursor / daily)) - 1) * 86400000),
      });
    };
    sortedPlaying.forEach((x) => add(x, 'playing'));
    wishlist.filter((w) => !playing.some((p) => p.id === w.id)).forEach((x) => add(x, 'wishlist'));
    return rows;
  }

  function td(content, cls) {
    const el = document.createElement('td');
    if (cls) el.className = cls;
    if (content instanceof Node) el.appendChild(content);
    else el.textContent = content;
    return el;
  }

  function renderPlan() {
    const box = document.getElementById('vrt-plan');
    if (!box || !planState) return;
    const d = load();
    const body = box.querySelector('.vrt-plan-body');
    body.replaceChildren();

    if (planState.error) {
      body.textContent = `Impossible de charger ta liste (${planState.error}).`;
      return;
    }

    const rows = buildPlan(planState.playing, planState.wishlist, d);
    const summary = box.querySelector('summary');
    const lastPlaying = [...rows].reverse().find((r) => r.group === 'playing' && r.end);
    const lastAll = [...rows].reverse().find((r) => r.end);
    summary.replaceChildren('Planning de lecture à ', link(fmtPace(d), setHoursPerDay));
    if (lastPlaying) summary.append(` · en cours finis vers le ${fmtDate(lastPlaying.end)}`);
    if (lastAll && lastAll.group === 'wishlist') summary.append(` · wishlist vers le ${fmtDate(lastAll.end)}`);

    if (!rows.length) {
      body.textContent = 'Rien dans "Playing" ni dans ta wishlist.';
      return;
    }

    const table = document.createElement('table');
    table.className = 'stripe vrt-plan-table';
    const thead = document.createElement('thead');
    const htr = document.createElement('tr');
    ['', 'Visual novel', 'Lu', 'Reste', 'Fin estimée'].forEach((h) => htr.appendChild(td(h)));
    thead.appendChild(htr);
    const tbody = document.createElement('tbody');

    let lastGroup = null;
    rows.slice(0, PLAN_MAX_ROWS).forEach((r, i) => {
      if (r.group !== lastGroup) {
        const gtr = document.createElement('tr');
        const gtd = td(r.group === 'playing' ? 'En cours' : 'Wishlist (après les en cours)', 'vrt-plan-group');
        gtd.colSpan = 5;
        gtr.appendChild(gtd);
        tbody.appendChild(gtr);
        lastGroup = r.group;
      }
      const tr = document.createElement('tr');
      const a = document.createElement('a');
      a.href = `/${r.id}`;
      a.textContent = r.title;
      a.title = r.title;
      tr.append(
        td(r.running ? '⏱' : String(i + 1), 'vrt-dim'),
        td(a, 'vrt-plan-title'),
        td(r.read ? fmt(r.read) : '—', 'vrt-dim'),
        td(r.remaining === null ? '?' : `~${fmt(r.remaining)}`),
        td(r.end ? fmtDate(r.end) : '—')
      );
      tbody.appendChild(tr);
    });
    table.append(thead, tbody);
    body.appendChild(table);

    if (rows.length > PLAN_MAX_ROWS) {
      const more = document.createElement('p');
      more.className = 'vrt-dim';
      more.textContent = `+${rows.length - PLAN_MAX_ROWS} autres VN · tout fini vers le ${lastAll ? fmtDate(lastAll.end) : '?'}`;
      body.appendChild(more);
    }
  }

  async function initPlan() {
    if (!ulistUser || ulistUser !== myUserId() || document.getElementById('vrt-plan')) return;
    const article = document.querySelector('main > article');
    if (!article) return;

    const box = document.createElement('details');
    box.id = 'vrt-plan';
    const label = new URLSearchParams(location.search).getAll('l');
    box.open = label.includes('1') || label.includes('5');
    const summary = document.createElement('summary');
    summary.textContent = 'Planning de lecture…';
    const body = document.createElement('div');
    body.className = 'vrt-plan-body';
    body.textContent = 'Chargement…';
    box.append(summary, body);
    const h1 = article.querySelector('h1');
    if (h1) h1.insertAdjacentElement('afterend', box);
    else article.prepend(box);

    try {
      const [playing, wishlist] = await Promise.all([fetchUlist(ulistUser, 1), fetchUlist(ulistUser, 5)]);
      planState = { playing, wishlist };
    } catch (err) {
      planState = { error: err.message.slice(0, 80) };
    }
    renderPlan();
  }

  function refreshAll() {
    update();
    renderPlan();
  }

  function init() {
    initPlan();
    if (typeof GM_addValueChangeListener === 'function' && ulistUser) GM_addValueChangeListener(KEY, () => renderPlan());
    if (!vnId || document.getElementById('vrt-row')) return;
    vndbMin = readVndbMinutes();
    const tr = buildRow();
    placeRow(tr);
    update();

    fetchChars().then((c) => {
      chars = c;
      if (chars || vndbMin) {
        const d = load();
        if (d.vns[vnId]) {
          entry(d);
          save(d);
        }
      }
      placeRow(tr);
      update();
    });

    setInterval(update, 1000);
    if (typeof GM_addValueChangeListener === 'function') GM_addValueChangeListener(KEY, () => update());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
