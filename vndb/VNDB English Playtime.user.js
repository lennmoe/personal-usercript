// ==UserScript==
// @name         VNDB - English Playtime
// @namespace    vndb-english-playtime
// @version      1.0
// @description  Adds a "Playtime EN (est.)" row on VNDB pages, like jiten's "Playtime (est.)" but for reading the English translation. It takes the Japanese character count from jiten.moe, converts it to English words (default 0.5 words per JP character) and divides by your English reading speed (default 250 words/min). It also shows the estimated word count and how many days it takes at your daily reading time (default 2h/day). Click "settings" in the row to change the speed, the conversion ratio and the hours per day.
// @author       lennmoe
// @homepageURL  https://github.com/lennmoe/personal-usercript
// @downloadURL  https://github.com/lennmoe/personal-usercript/raw/main/vndb/VNDB%20English%20Playtime.user.js
// @updateURL    https://github.com/lennmoe/personal-usercript/raw/main/vndb/VNDB%20English%20Playtime.user.js
// @match        https://vndb.org/v*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @connect      api.jiten.moe
// ==/UserScript==

(function () {
  'use strict';

  const DEFAULTS = { wpm: 250, wordsPerChar: 0.5, hoursPerDay: 2 };

  const vnId = location.pathname.match(/^\/(v\d+)$/)?.[1];
  if (!vnId) return;

  function getSettings() {
    return {
      wpm: GM_getValue('wpm', DEFAULTS.wpm),
      wordsPerChar: GM_getValue('wordsPerChar', DEFAULTS.wordsPerChar),
      hoursPerDay: GM_getValue('hoursPerDay', DEFAULTS.hoursPerDay),
    };
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

  function formatTime(hours) {
    if (hours < 1) return `${Math.round(hours * 60)}m`;
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return m ? `${h}h ${m}m` : `${h}h`;
  }

  function formatWords(n) {
    if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
    if (n >= 1e3) return `${Math.round(n / 1e3)}k`;
    return String(Math.round(n));
  }

  const fmtNum = (n) => Math.round(n).toLocaleString('en-US');

  function findRow(label) {
    return [...document.querySelectorAll('tr')].find((tr) => tr.querySelector('td')?.textContent.trim() === label);
  }

  GM_addStyle(`
    #vep-row .vep-dim { color: var(--grayedout); }
    #vep-row .vep-label { cursor: help; border-bottom: 1px dotted var(--grayedout); }
    #vep-row .vep-settings-link { margin-left: 8px; font-size: 11px; }
    #vep-row .vep-settings { margin-top: 4px; display: none; flex-wrap: wrap; gap: 4px 12px; }
    #vep-row .vep-settings.vep-open { display: flex; }
    #vep-row .vep-settings label { white-space: nowrap; }
    #vep-row .vep-settings input { width: 60px; margin-left: 4px; text-align: right; }
  `);

  function buildRow(chars) {
    const tr = document.createElement('tr');
    tr.id = 'vep-row';

    const tdL = document.createElement('td');
    const label = document.createElement('span');
    label.className = 'vep-label';
    label.textContent = 'Playtime EN (est.)';
    tdL.appendChild(label);

    const tdV = document.createElement('td');
    const time = document.createElement('span');
    const info = document.createElement('span');
    info.className = 'vep-dim';
    const settingsLink = document.createElement('a');
    settingsLink.className = 'vep-settings-link';
    settingsLink.textContent = 'settings';

    const panel = document.createElement('div');
    panel.className = 'vep-settings';
    const inputs = {};
    [
      ['wpm', 'Reading speed (words/min)', 50, 1000, 10],
      ['wordsPerChar', 'EN words per JP char', 0.1, 2, 0.05],
      ['hoursPerDay', 'Hours per day (0 = hide)', 0, 24, 0.5],
    ].forEach(([key, text, min, max, step]) => {
      const l = document.createElement('label');
      l.textContent = text;
      const input = document.createElement('input');
      input.type = 'number';
      input.min = min;
      input.max = max;
      input.step = step;
      input.value = getSettings()[key];
      input.addEventListener('input', () => {
        const v = parseFloat(input.value);
        if (!Number.isFinite(v) || v < 0 || (key !== 'hoursPerDay' && v <= 0)) return;
        GM_setValue(key, v);
        render();
      });
      l.appendChild(input);
      panel.appendChild(l);
      inputs[key] = input;
    });

    settingsLink.addEventListener('click', (e) => {
      e.preventDefault();
      panel.classList.toggle('vep-open');
    });

    tdV.append(time, info, settingsLink, panel);
    tr.append(tdL, tdV);

    function render() {
      const s = getSettings();
      const words = chars * s.wordsPerChar;
      const hours = words / s.wpm / 60;
      time.textContent = formatTime(hours);
      const parts = [`~${formatWords(words)} words`];
      if (s.hoursPerDay > 0) {
        const days = Math.max(1, Math.ceil(hours / s.hoursPerDay));
        parts.push(`${days} day${days > 1 ? 's' : ''} at ${formatTime(s.hoursPerDay)}/day`);
      }
      info.textContent = ` · ${parts.join(' · ')}`;
      label.title = `Estimated from ${fmtNum(chars)} JP characters (jiten.moe) x ${s.wordsPerChar} = ${fmtNum(words)} English words, read at ${s.wpm} words/min.`;
    }

    render();
    return tr;
  }

  function placeRow(tr) {
    const anchor =
      document.getElementById('jiten-playtime-row') ||
      document.getElementById('jiten-charcount-row') ||
      findRow('Play time') ||
      findRow('Release Dates');
    if (anchor) anchor.parentNode.insertBefore(tr, anchor.nextSibling);
  }

  async function init() {
    if (document.getElementById('vep-row')) return;
    const chars = await fetchChars();
    if (!chars) return;
    const tr = buildRow(chars);
    placeRow(tr);
    if (document.getElementById('jiten-playtime-row')) return;
    const observer = new MutationObserver(() => {
      const jiten = document.getElementById('jiten-playtime-row') || document.getElementById('jiten-charcount-row');
      if (jiten && jiten.nextSibling !== tr) placeRow(tr);
      if (document.getElementById('jiten-playtime-row')) observer.disconnect();
    });
    observer.observe(tr.parentNode, { childList: true });
    setTimeout(() => observer.disconnect(), 20000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
