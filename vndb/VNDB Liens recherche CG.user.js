// ==UserScript==
// @name         VNDB - Liens recherche CG (e-hentai / exhentai / hitomi.la / imhentai)
// @namespace    vndb-cg-search-links
// @version      1.1
// @description  Ajoute une ligne "CG Search" sous "Release Dates" avec des liens de recherche e-hentai, exhentai, hitomi.la et imhentai pour les titres JP (original + romaji) et EN uniquement, jamais les aliases. Le titre complet est visible au survol du drapeau.
// @author       lennmoe
// @homepageURL  https://github.com/lennmoe/personal-usercript
// @downloadURL  https://github.com/lennmoe/personal-usercript/raw/main/vndb/VNDB%20Liens%20recherche%20CG.user.js
// @updateURL    https://github.com/lennmoe/personal-usercript/raw/main/vndb/VNDB%20Liens%20recherche%20CG.user.js
// @match        https://vndb.org/v*
// @match        https://vndb.org/*v*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const SITES = [
    { name: 'e-hentai', build: (q) => `https://e-hentai.org/?f_search=${encodeURIComponent(q)}` },
    { name: 'exhentai', build: (q) => `https://exhentai.org/?f_search=${encodeURIComponent(q)}` },
    { name: 'hitomi', build: (q) => `https://hitomi.la/search.html?${encodeURIComponent(q)}` },
    {
      name: 'imhentai',
      build: (q) =>
        `https://imhentai.xxx/search/?lt=1&pp=0&m=1&d=1&w=1&i=1&a=1&g=1&key=${encodeURIComponent(
          q
        )}&apply=Search&en=1&jp=1&es=1&fr=1&kr=1&de=1&ru=1&dl=0&tr=0`,
    },
  ];

  function findRow(label) {
    return [...document.querySelectorAll('tbody > tr')].find((tr) =>
      label.test(tr.querySelector('td')?.textContent?.trim() || '')
    );
  }

  function getTitles() {
    const titles = [];
    const seen = new Set();

    let titlesCell = document.querySelector('td.titles:not(.scriptLinks)');
    if (!titlesCell) titlesCell = findRow(/^Title$/i)?.querySelectorAll('td')[1];
    if (!titlesCell) return [];

    titlesCell.querySelectorAll('tr.title').forEach((tr) => {
      const abbr = tr.querySelector('abbr');
      const isJa = abbr?.classList.contains('icon-lang-ja');
      const isEn = abbr?.classList.contains('icon-lang-en');
      if (!isJa && !isEn) return;
      const lang = isJa ? 'ja' : 'en';

      const cell = tr.querySelectorAll('td')[1];
      if (!cell) return;

      cell.innerHTML
        .split(/<br\s*\/?>/i)
        .map((part) => {
          const tmp = document.createElement('div');
          tmp.innerHTML = part;
          return tmp.textContent.trim();
        })
        .filter(Boolean)
        .forEach((text, i) => {
          const key = lang + '|' + text;
          if (seen.has(key)) return;
          seen.add(key);
          titles.push({ text, romaji: lang === 'ja' && i > 0, abbrNode: abbr });
        });
    });

    return titles;
  }

  function buildLinksRow(titles) {
    const tr = document.createElement('tr');
    tr.id = 'cg-search-links-row';

    const tdLabel = document.createElement('td');
    tdLabel.textContent = 'CG Search';
    tr.appendChild(tdLabel);

    const tdContent = document.createElement('td');
    tdContent.className = 'scriptLinks';

    titles.forEach(({ text, romaji, abbrNode }) => {
      const line = document.createElement('div');
      line.title = text;
      line.style.whiteSpace = 'nowrap';

      const tag = document.createElement('span');
      tag.style.display = 'inline-block';
      tag.style.minWidth = '4.5em';
      tag.style.opacity = '0.7';
      tag.style.cursor = 'help';
      tag.appendChild(abbrNode.cloneNode(true));
      if (romaji) tag.appendChild(document.createTextNode(' romaji'));
      line.appendChild(tag);

      SITES.forEach((site, i) => {
        if (i > 0) {
          const sep = document.createElement('span');
          sep.textContent = ' · ';
          sep.style.opacity = '0.4';
          line.appendChild(sep);
        }
        const a = document.createElement('a');
        a.href = site.build(text);
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = site.name;
        line.appendChild(a);
      });

      tdContent.appendChild(line);
    });

    tr.appendChild(tdContent);
    return tr;
  }

  function init() {
    if (document.getElementById('cg-search-links-row')) return;
    const titles = getTitles();
    if (!titles.length) return;

    const row = buildLinksRow(titles);
    const anchorRow =
      findRow(/^Release Dates$/i) ||
      [...document.querySelectorAll('tbody > tr')].find((tr) => tr.querySelector('td.titles:not(.scriptLinks)')) ||
      findRow(/^Title$/i);

    if (anchorRow?.parentNode) {
      anchorRow.parentNode.insertBefore(row, anchorRow.nextSibling);
    } else {
      const tbody = document.querySelector('tbody');
      if (tbody) tbody.insertBefore(row, tbody.firstChild);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
