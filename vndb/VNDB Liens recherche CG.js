// ==UserScript==
// @name         VNDB - Liens recherche CG (e-hentai / hitomi.la / imhentai)
// @namespace    vndb-cg-search-links
// @version      1.0
// @description  Ajoute une ligne avec des liens de recherche CG pour le(s) titre(s) JP et EN uniquement (pas les aliases)
// @author       you
// @match        https://vndb.org/v*
// @match        https://vndb.org/*v*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // --- Config des sites de recherche ---
  const SITES = [
    {
      name: 'e-hentai',
      build: (q) => `https://e-hentai.org/?f_search=${encodeURIComponent(q)}`,
    },
    {
      name: 'hitomi',
      build: (q) => `https://hitomi.la/search.html?${encodeURIComponent(q)}`,
    },
    {
      name: 'imhentai',
      build: (q) =>
        `https://imhentai.xxx/search/?lt=1&pp=0&m=1&d=1&w=1&i=1&a=1&g=1&key=${encodeURIComponent(
          q
        )}&apply=Search&en=1&jp=1&es=1&fr=1&kr=1&de=1&ru=1&dl=0&tr=0`,
    },
  ];

  // --- Récupération des titres depuis la page (uniquement JP et EN, jamais les aliases) ---
  function getTitles() {
    const titles = [];
    const seen = new Set();

    // Le bloc "Titles" utilise <td class="titles">, alors que le bloc "Other Links"
    // utilise <td class="titles scriptLinks">. On exclut ce dernier pour ne pas
    // capturer des liens de boutique comme "ErogameScape", "Getchu", etc.
    // Ancien format de fiche : <tr><td>Title</td><td><table>...<tr class="title">...</table></td></tr>
    let titlesCell = document.querySelector('td.titles:not(.scriptLinks)');
    if (!titlesCell) {
      const rows = [...document.querySelectorAll('tbody > tr')];
      const oldTitleRow = rows.find(
        (tr) => /^Title$/i.test(tr.querySelector('td')?.textContent?.trim() || '')
      );
      if (oldTitleRow) titlesCell = oldTitleRow.querySelectorAll('td')[1];
    }
    if (!titlesCell) return [];

    titlesCell.querySelectorAll('tr.title').forEach((tr) => {
      const abbr = tr.querySelector('abbr');
      const isJa = abbr?.classList.contains('icon-lang-ja');
      const isEn = abbr?.classList.contains('icon-lang-en');
      if (!isJa && !isEn) return; // on ignore ko, zh-Hans, zh-Hant, etc.
      const lang = isJa ? 'ja' : 'en';

      const cells = tr.querySelectorAll('td');
      const cell = cells[1]; // 2e <td> = celui qui contient le(s) titre(s)
      if (!cell) return;

      // Le titre romaji est parfois après un <br> dans le même td (ex: JP<br>Romaji)
      cell.innerHTML
        .split(/<br\s*\/?>/i)
        .map((part) => {
          const tmp = document.createElement('div');
          tmp.innerHTML = part;
          return tmp.textContent.trim();
        })
        .filter(Boolean)
        .forEach((text) => {
          const key = lang + '|' + text;
          if (!seen.has(key)) {
            seen.add(key);
            titles.push({ text, lang, abbrNode: abbr.cloneNode(true) });
          }
        });
    });

    return titles;
  }

  // --- Construction de la ligne de tableau (même format que les autres rows de la fiche) ---
  function buildLinksRow(titles) {
    const tr = document.createElement('tr');
    tr.id = 'cg-search-links-row';

    const tdLabel = document.createElement('td');
    tdLabel.textContent = 'CG Search';
    tr.appendChild(tdLabel);

    const tdContent = document.createElement('td');
    tdContent.id = 'officialLinks';
    tdContent.className = 'scriptLinks';

    titles.forEach(({ text, abbrNode }) => {
      const line = document.createElement('div');

      const label = document.createElement('span');
      label.style.opacity = '0.8';
      if (abbrNode) {
        label.appendChild(abbrNode.cloneNode(true));
        label.appendChild(document.createTextNode(' ' + text + ' — '));
      } else {
        label.textContent = text + ' — ';
      }
      line.appendChild(label);

      SITES.forEach((site) => {
        const a = document.createElement('a');
        a.href = site.build(text);
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = site.name;
        a.style.marginRight = '0.6em';
        line.appendChild(a);
      });

      tdContent.appendChild(line);
    });

    tr.appendChild(tdContent);
    return tr;
  }

  // --- Injection dans la page ---
  function init() {
    const titles = getTitles();
    if (!titles.length) return;
    if (document.getElementById('cg-search-links-row')) return; // évite les doublons

    const row = buildLinksRow(titles);

    // On insère juste après la ligne "Release Dates"
    const rows = [...document.querySelectorAll('tbody > tr')];
    const releaseDatesRow = rows.find((tr) =>
      /^Release Dates$/i.test(tr.querySelector('td')?.textContent?.trim() || '')
    );
    const titlesDetailsRow = rows.find((tr) => tr.querySelector('td.titles:not(.scriptLinks)'));
    const titleRow = rows.find((tr) =>
      /^Title$/i.test(tr.querySelector('td')?.textContent?.trim() || '')
    );

    const anchorRow = releaseDatesRow || titlesDetailsRow || titleRow;
    if (anchorRow && anchorRow.parentNode) {
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