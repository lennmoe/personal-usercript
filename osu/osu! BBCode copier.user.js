// ==UserScript==
// @name        osu! BBCode copier
// @version     1.63
// @author      Actiol
// @match       https://osu.ppy.sh/*
// @grant       GM_registerMenuCommand
// @description Adds a button to me! sections, beatmap descriptions, forum posts and team infos to copy those directly as BBCode as well as adding a copy button to beatmap comments and discussion posts to copy the text as osu's markdown
// @downloadURL https://github.com/Actiol/osu-bbcode-copier/raw/refs/heads/main/bbcode.user.js
// @updateURL   https://github.com/Actiol/osu-bbcode-copier/raw/refs/heads/main/bbcode.user.js
// @homepageURL https://github.com/Actiol/osu-bbcode-copier
// ==/UserScript==

const debug = false;

const copyClipboard =
    `<svg id="Layer_1" data-name="Layer 1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22 22" fill="none" stroke="currentColor">
        <rect class="cls-1" x="1.5" y="6.5" width="14" height="14" rx="3" ry="3"/>
        <path class="cls-1" d="M15.5,15.5h2c1.66,0,3-1.34,3-3V4.5c0-1.66-1.34-3-3-3h-8c-1.66,0-3,1.34-3,3v2"/>
    </svg>`

var icons = Object.freeze({
    copyClipboard: copyClipboard
});


// if theres an easier way to get the colour in hex pls lemme know
function rgbToHex(rgb) {
    const result = rgb.match(/^rgba?\((\d+), (\d+), (\d+)(?:, (\d+\.?\d*))?\)$/);
    if (!result) return null;

    const r = parseInt(result[1]);
    const g = parseInt(result[2]);
    const b = parseInt(result[3]);

    return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1).toUpperCase()}`;
}



function decodeHTML(html) {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = html;
    return textarea.value;
}

function htmlToMarkdown(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const rules = [
        {
            selector: `span.proportional-container.js-gallery,
                    span.proportional-container__height,
                    span.bbcode-spoilerbox__link-icon,
                    span:not([class]):not([id]):not([style]):not([data-]),
                    p,
                    a[class="beatmap-discussion-timestamp-decoration"]`,
            action: el => el.replaceWith(el.innerHTML),                                                     // garbage removal
        },
        { selector: 'div.open_grepper_editor', action: el => el.remove() },                                 // remove grapper div
        { selector: 'a[href^="https://score.kirino.sh/clan/"]', action: el => el.remove() },                // remove clan tags
        { selector: 'br', action: el => el.replaceWith('\n') },                                             // new lines
        { selector: 'strong', action: el => el.replaceWith(`**${el.innerHTML}**`) },                        // bold
        { selector: 'em', action: el => el.replaceWith(`*${el.innerHTML}*`) },                              // italic
        { selector: 'del', action: el => el.replaceWith(`~~${el.innerHTML}~~`) },                           // strikeout
        {
            selector: 'blockquote',
            action: el => {
                const quoteText = el.innerHTML;
            el.replaceWith(`> ${quoteText}\n`);                                                             // quote
            },
        },
        {
            selector: 'code',
            action: el => el.replaceWith(`\`${el.innerHTML}\``),                                            // code
        },
        {
            selector: 'pre',
            action: el => el.replaceWith(`\`\`\`\n${el.innerHTML}\n\`\`\`\n`),                              // codebloack
        },
        {
            selector: ['a[class="beatmapset-discussion-image-link"]', 'img[class="osu-md__figure-image"]'],
            action : el => {
                const imgLink = decodeURIComponent(el.getAttribute('href')?.split('url?url=')[1] ?? el.getAttribute('src') ?? '');
                const alt = el.lastChild?.getAttribute('alt') ?? el.getAttribute('alt') ?? '';
                el.replaceWith(`![${alt}](${imgLink})`);
            },
        },
        {
            selector: 'a[rel="nofollow noreferrer"]',
            action: el => {
                const url = el.getAttribute('href');
                if (url.includes('https://osu.ppy.sh/beatmapsets/') || el.innerHTML === url) {
                    el.replaceWith(url);
                } else {
                    el.replaceWith(`[${el.innerHTML}](${url})`);                                            // url
                }

            },
        },
        {
            selector: 'ul',
            action: el => {
                const listPoints = el.querySelectorAll('li');
                var text = ''
                listPoints.forEach((li) => {
                    text += `- ${li.querySelector('div')?.textContent.trim() ?? ''}\n`;
                });
                el.replaceWith(text);                                                                       // dotted list
            },
        },
        {
            selector: 'ol',
            action: el => {
                const listPoints = el.querySelectorAll('li');
                var text = ''
                listPoints.forEach((li, i) => {
                    text += `${i+1}. ${li.querySelector('div')?.textContent.trim() ?? ''}\n`;
                });
                el.replaceWith(text);                                                                       // numbered list
            },
        },
        {
            selector: 'h1',
            action: el => el.replaceWith(`# ${el.textContent}\n`),                         // heading
        },
        {
            selector: 'h2',
            action: el => el.replaceWith(`## ${el.textContent}\n`),                         // heading
        },
        {
            selector: 'h3',
            action: el => el.replaceWith(`### ${el.textContent}\n`),                         // heading
        },
        {
            selector: 'h4',
            action: el => el.replaceWith(`#### ${el.textContent}\n`),                         // heading
        },
        {
            selector: 'h5',
            action: el => el.replaceWith(`##### ${el.textContent}\n`),                         // heading
        },
        {
            selector: 'h6',
            action: el => el.replaceWith(`###### ${el.textContent}\n`),                         // heading
        },
        {
            selector: 'hr',
            action: el => el.replaceWith(`---`),                                                          // line
        },
    ];

    let previousHTML;
    do {
        previousHTML = doc.body.innerHTML;
        rules.forEach(({ selector, action }) => {
            const elements = Array.from(doc.querySelectorAll(selector));
            elements.forEach(action);
        });

        doc.body.innerHTML = decodeHTML(doc.body.innerHTML);
    } while (doc.body.innerHTML !== previousHTML); // Stop when no more changes occur

    return decodeHTML(doc.body.innerHTML);
}


function htmlToBBCode(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const rules = [
        {
            selector: `span.proportional-container.js-gallery,
                    span.proportional-container__height,
                    span.bbcode-spoilerbox__link-icon,
                    span:not([class]):not([id]):not([style]):not([data-])`,
            action: el => el.replaceWith(el.innerHTML),                                                     // garbage removal
        },
        { selector: 'div.open_grepper_editor', action: el => el.remove() },                                 // remove grapper div
        { selector: 'a[href^="https://score.kirino.sh/clan/"]', action: el => el.remove() },                // remove clan tags
        { selector: 'br', action: el => el.replaceWith('\n') },                                             // new lines
        { selector: 'strong', action: el => el.replaceWith(`[b]${el.innerHTML}[/b]`) },                     // bold
        { selector: 'em', action: el => el.replaceWith(`[i]${el.innerHTML}[/i]`) },                         // italic
        { selector: 'u', action: el => el.replaceWith(`[u]${el.innerHTML}[/u]`) },                          // underlined
        { selector: 'del', action: el => el.replaceWith(`[strike]${el.innerHTML}[/strike]`) },              // strikeout
        {
            selector: 'span[style*="color"]',
            action: el => {
                const color = rgbToHex(el.style.color);
                el.replaceWith(`[color=${color}]${el.innerHTML}[/color]`);                                  // colour
            },
        },
        {
            selector: 'span[style*="font-size"]',
            action: el => {
                const size = el.style.fontSize.slice(0,-1);
                el.replaceWith(`[size=${size}]${el.innerHTML}[/size]`);                                     // size
            },
        },
        {
            selector: 'span.spoiler',
            action: el => el.replaceWith(`[spoiler]${el.innerHTML}[/spoiler]`),                             // spoiler
        },
        {
            selector: 'div.js-spoilerbox.bbcode-spoilerbox > a',
            action: el => {
                const boxName = el
                    .querySelector('.bbcode-spoilerbox__link-text')
                    .innerHTML
                const body = el
                    .closest('.js-spoilerbox')
                    .querySelector('.js-spoilerbox__body');
                const text = body ? body.innerHTML : '';

                if (boxName == 'SPOILER') {
                    el.closest('.js-spoilerbox').replaceWith(
                    `[spoilerbox]${text}[/spoilerbox]\n`                                                    // spoilerbox
                    );
                } else {
                    el.closest('.js-spoilerbox').replaceWith(
                    `[box=${boxName}]\n${text}\n[/box]\n`                                                   // box
                    );
                }
            },
        },
        {
            selector: 'blockquote',
            action: el => {
                if (el.innerHTML.includes('</h4>')) {                                                       // quote "NAME wrote:"
                    const author = el
                        .querySelector('h4')
                        .textContent.replace(' wrote:', '');
                    const [_, quoteText] = el.innerHTML.split('</h4>');                                     // someone make this cleaner pls
                    el.replaceWith(`[quote="${author}"]\n${quoteText}\n[/quote]\n`);
                }
                else {                                                                                      // empty quote
                    const quoteText = el.innerHTML;
                    el.replaceWith(`[quote]\n${quoteText}\n[/quote]\n`);
                }
                                            // quote
            },
        },
        {
            selector: 'code',
            action: el => el.replaceWith(`[c]${el.innerHTML}[/c]`),                                         // code
        },
        {
            selector: 'pre',
            action: el => el.replaceWith(`[code]\n${el.innerHTML}\n[/code]\n`),                             // codebloack
        },
        { selector: 'center', action: el => el.replaceWith(`[centre]${el.innerHTML}[/centre]`) },           // center
        { selector: 'div.bbcode__align-centre', action: el => el.replaceWith(`[centre]${el.innerHTML}[/centre]`) },
        {
            selector: 'a[rel="nofollow"]',
            action: el => {
                const url = el.getAttribute('href');


                if (url.startsWith('mailto:')) {
                    const email = url.replace('mailto:', '');
                    el.replaceWith(`[email=${email}]${el.textContent}[/email]`);                            // email
                } else {
                    el.replaceWith(`[url=${url}]${el.innerHTML}[/url]`);                                    // url
                }

            },
        },
        {
            selector: 'a[data-user-id]',
            action: el => {
                const userId = el.getAttribute('data-user-id');
                el.replaceWith(`[profile=${userId}]${el.innerHTML}[/profile]`);                             // profile
            },
        },
        {
            selector: 'ol.unordered',
            action: el => el.replaceWith(`[list]\n${el.innerHTML}[/list]\n`),                               // dotted list
        },
        {
            selector: 'ol',
            action: el => el.replaceWith(`[list=meow]\n${el.innerHTML}[/list]\n`),                          // numbered list
        },
        {
            selector: 'li',
            action: el => el.replaceWith(`[*]${el.innerHTML}\n`),                                           // list points
        },
        {
            selector: 'a[href^="mailto:"]',
            action: el => {
                const email = el.getAttribute('href').replace('mailto:', '');
                el.replaceWith(`[email=${email}]${el.textContent}[/email]`);                                // email
            },
        },
        {
            selector: 'img:not([class=imagemap__image])',
            action: el => el.replaceWith(`[img]${el.getAttribute('src')}[/img]`),                           // image
        },
        {
            selector: '.imagemap',
            action: el => {
                // image
                const image = `${el.querySelector('img.imagemap__image').getAttribute('src')}`;

                // image links
                var formattedlinks = [];
                const links = Array.from(el.querySelectorAll('a.imagemap__link'));
                links.forEach(link => {
                    const position = Array.from(
                        link.getAttribute('style').matchAll(/([a-zA-Z-]+):([0-9.]+)%/g)
                    ).map(match => parseFloat(match[2]));
                    const linkHref = link.getAttribute('href');
                    const title = link.getAttribute('title');

                    formattedlinks.push(`${position.join(' ')} ${linkHref} ${title}\n`);
                });
                el.replaceWith(`[imagemap]\n${image}\n${formattedlinks.join('')}[/imagemap]\n`)             // imagemaps
            }
        },
        {
            selector: 'iframe[src*="youtube.com/embed"]',
            action: el => {
            const youtubeId = new URL(el.src).pathname.split('/')[2];
            el.replaceWith(`[youtube]${youtubeId}[/youtube]`);                                              // youtube
            },
        },
        { selector: 'div.audio-player__button', action: el => el.remove() },                                // audio player (button removal)
        {
            selector: 'div.audio-player',
            action: el => {
            const audioUrl = el.getAttribute('data-audio-url');
            el.replaceWith(`[audio]${audioUrl}[/audio]`);                                                   // audio player
            },
        },
        {
            selector: 'h2',
            action: el => el.replaceWith(`[heading]${el.textContent}[/heading]\n`),                         // heading
        },
        {
            selector: 'div.well',
            action: el => el.replaceWith(`[notice]\n${el.textContent}\n[/notice]`),                         // notice
        },
    ];

    let previousHTML;
    do {
        previousHTML = doc.body.innerHTML;
        rules.forEach(({ selector, action }) => {
            const elements = Array.from(doc.querySelectorAll(selector));
            elements.forEach(action);
        });

        doc.body.innerHTML = decodeHTML(doc.body.innerHTML);
    } while (doc.body.innerHTML !== previousHTML); // Stop when no more changes occur

    return decodeHTML(doc.body.innerHTML);
}


function copyToClipboard(html, bbool){
    const textArea = document.createElement('textarea');
    if (bbool) {
        clipboard = htmlToBBCode(html);
    } else {
        clipboard = htmlToMarkdown(html);
    }
    navigator.clipboard.writeText(clipboard);
}

function highlightBody(target, opacity) {
    const intervalId = setInterval(() => {
        target.style.outline = `2px solid rgba(255, 0, 0, ${opacity})`;
        var realopacity = opacity;
        if (realopacity > 1) {
            realopacity = 1;
        }

        var backOpactiy = 0.1 * realopacity;

        target.style.background = `rgba(255, 0, 0, ${backOpactiy})`;

        if (opacity <= 0) {
            clearInterval(intervalId);
        }

        opacity -= .01;
    }, 1);
}


function injectComment(header, mdBody, pageType) {
    'use strict';

    function waitForElement(selector, callback) {
        const interval = setInterval(() => {
            const targetElements = document.querySelectorAll(selector);
            // console.log(targetElements.length);
            if (targetElements.length > 0) {
                clearInterval(interval);
                targetElements.forEach(callback);
            }
        }, 100);
    }
    waitForElement(header, (targetElement) => {
        if (targetElement.querySelector('.comment__action--copymd') ||
            targetElement.querySelector('.copy-markdown-button')) {
          //if ([...targetElement.querySelectorAll('.comment__row-item')].some(item => item.textContent.trim().toLowerCase() === "copy")) {
            if (debug) {console.log('Button already added.');}
            return;
        }

        if (debug) {
            targetElement.style.outline = "2px solid red";
        }

        const comment__row_item = document.createElement('div');
        comment__row_item.setAttribute('class', "comment__row-item");

        const comment__action = comment__row_item.appendChild(document.createElement('button'));
        comment__action.setAttribute('type', 'button');
        comment__action.setAttribute('class', 'comment__action comment__action--copymd');
        comment__action.setAttribute('data-tooltip-hide-events', "mouseleave");
        comment__action.setAttribute('data-tooltip-pin-position',"true");
        comment__action.setAttribute('data-tooltip-position',"bottom center");
        comment__action.setAttribute('data-orig-title',"click to copy to clipboard");
        comment__action.setAttribute('aria-describedby',"qtip-1");

        if (pageType === 'discussion') {
            comment__action.setAttribute('class', "beatmap-discussion-post__action beatmap-discussion-post__action--button copy-markdown-button");
            comment__action.setAttribute('data-hasqtip',"2");
        }


        comment__action.textContent = "copy";
        comment__action.title = "click to copy to clipboard"

    /*
        const comment__button = comment__action.appendChild(document.createElement('button'));
        comment__button.setAttribute('type', 'button');
        comment__button.textContent = "copy";
    */


        comment__action.addEventListener('click', (event) => {

            if (pageType === 'discussion') { event.stopPropagation(); }

            const tooltip = comment__action.getAttribute('aria-describedby');
            const tooltipElement = document.getElementById(tooltip);

            const newText = 'copied to clipboard!';
            tooltipElement.querySelector('.qtip-content').textContent = newText;
            $(event.target).qtip('reposition');

            const parentDiv = targetElement.closest('.comment__container') ||
                              targetElement.closest('.beatmap-discussion-post__message-container');

            const curmdbody = parentDiv.querySelector(mdBody);

            if (debug) {
                highlightBody(curmdbody, 2);
            }

            const mdContent = curmdbody.innerHTML.trim();


            copyToClipboard(mdContent, false);

        })

        comment__action.addEventListener('mouseover', () => {
            comment__action.style.textDecoration = "underline";
        })

        comment__action.addEventListener('mouseleave', () => {
            comment__action.title = comment__action.getAttribute('data-orig-title');
            comment__action.style.textDecoration = "";
        })

        var appendElement;
        if (pageType === 'discussion') {
            appendElement = comment__action;
        } else {
            appendElement = comment__row_item;
        }

        const lastChild = targetElement.lastElementChild;
        if ((lastChild.className === "comment__row-item") || (lastChild.className === "beatmap-discussion-post__action beatmap-discussion-post__action--button")) {
            targetElement.appendChild(appendElement);
        } else {
            targetElement.insertBefore(appendElement, lastChild);
        }

        if (debug) { console.log(`Appended copyButton to ${targetElement.className.split(' ')[targetElement.className.split(' ').length - 1]}.`); }


    })
}


function injectIcon(header, bbcodeBody, pageType){
    'use strict';

    function waitForElement(selector, callback) {
        const interval = setInterval(() => {
            const targetElements = document.querySelectorAll(selector);
            if (targetElements.length > 0) {
                clearInterval(interval);
                if (pageType === 'forum'){
                    targetElements.forEach(callback);
                }
                else {
                    callback(targetElements[0]);
                }
            }
        }, 100);
    }
    waitForElement(
        header,
        (targetElement) => {
            // abort if icon is already appended
            if (targetElement.querySelector('.copy-bbcode-icon')) {
                if (debug) {console.log('Icon already added.');}
                return;
            }

            if (debug) {
                targetElement.style.outline = "2px solid red";
            }

            var textColor = getComputedStyle(targetElement).color;

            const iconWrapper = document.createElement('span');

            iconWrapper.innerHTML = icons["copyClipboard"];
            iconWrapper.style.width = '16px';
            iconWrapper.style.height = '16px';
            iconWrapper.style.marginLeft = '4px';
            iconWrapper.style.verticalAlign = '-4px';
            iconWrapper.style.display = 'inline-block';
            iconWrapper.title = 'Copy as BBCode';
            iconWrapper.classList.add('copy-bbcode-icon');

            if (pageType === 'forum'){
                iconWrapper.style.width = '16px';
                iconWrapper.style.height = '16px';
                iconWrapper.style.marginLeft = '4px';
                iconWrapper.style.position = 'relative';
                iconWrapper.style.top = '4px';
                iconWrapper.style.display = 'inline-block';

                var colourElement = targetElement.querySelector('.forum-post__header-content-item .js-post-url .js-timeago');
                if (colourElement){
                    textColor = getComputedStyle(colourElement).color;
                }
            }

            const svg = iconWrapper.querySelector('svg');
            if (svg) {
                svg.style.cursor = 'pointer';
                svg.style.strokeWidth = '2.5';
                svg.style.color = textColor;
            } else {
                console.error('SVG not found inside the wrapper.');
            }



            // this doesnt work perfectly bc osu hides tooltips afetr clicking
            iconWrapper.addEventListener('click', () => {
                iconWrapper.title = 'Copied!';

                const parentDiv = targetElement.closest('.forum-post__body') ||
                                  targetElement.closest('.beatmapset-info__row') ||
                                  targetElement.closest('.page-extra.page-extra--userpage') ||
                                  targetElement.closest('.team-summary');
                const curbbcodeBody = parentDiv.querySelector(bbcodeBody);

                if (debug) {
                    highlightBody(curbbcodeBody, 2);
                }

                //var bbcodeBodies = document.querySelectorAll(bbcodeBody);

                const bbcodeContent = curbbcodeBody.innerHTML.trim();


                //const bbcodeContent = bbCodeBodies[targetElements.indexOf(targetElement)].innerHTML.trim();
                //const bbcodeContent = document.querySelector(bbcodeBody).innerHTML.trim();
                copyToClipboard(bbcodeContent, true);

                const checkmark = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
                checkmark.setAttribute('class', 'cls-1');
                checkmark.setAttribute('points', '5 14.27 7.75 17 12 10');
                checkmark.setAttribute('stroke-linejoin', 'round');
                checkmark.style.strokeLinecap = 'round';
                checkmark.style.stroke = 'currentColor';
                checkmark.style.strokeWidth = "2.5";
                checkmark.style.fill = 'none';
                checkmark.style.strokeDasharray = '50';
                checkmark.style.strokeDashoffset = '50';
                checkmark.style.animation = 'draw-in 2s ease-out forwards';

                svg.appendChild(checkmark);


                setTimeout(() => {
                    checkmark.style.animation = 'draw-out 2s ease-out forwards';
                }, 350);

                setTimeout(() => {
                    svg.removeChild(checkmark);
                }, 1500);

                //console.log(''); ???
            });

            iconWrapper.addEventListener('mouseover', () => {
                svg.style.animation = 'raise 3s cubic-bezier(0,.8,.55,1.0) forwards';
                svg.style.filter = 'drop-shadow(0px 1px 3px rgba(255,255,255, 0.4))';
            });

            iconWrapper.addEventListener('mouseleave', () => {
                iconWrapper.title = 'Copy as BBCode';
                svg.style.animation = 'descend 10s ease-out forwards';
                svg.style.filter = '';
            });

            targetElement.appendChild(iconWrapper);
            if (debug) {console.log('SVG icon added next to the Description header.');}
        }
    );
}

const style = document.createElement('style');
style.textContent = `
    @keyframes draw-in {
        from {
            stroke-dashoffset: 50; /* Start fully hidden */
        }
        to {
            stroke-dashoffset: 0; /* Fully revealed */
        }
    }
    @keyframes draw-out {
        from {
            stroke-dashoffset: 0; /* Fully visible */
        }
        to {
            stroke-dashoffset: -50; /* Fully hidden again */
        }
    }
    @keyframes raise {
        from {
            filter: drop-shadow(0px 1px 6px rgba(255,255,255, 0))
        }
        to {
            transform: translateY(-1px);
            filter: drop-shadow(0px 1px 3px rgba(255,255,255, 0.5));
        }
    }
    @keyframes descend {
        to {
            transform: translateY(0px);
            filter: none;
        }
    }
`;
document.head.appendChild(style);


function insertDiscussion(){

    // discussion page
    var disheader = '.beatmap-discussion-post__actions-group';
    var disbody = '.beatmap-discussion-post__message .osu-md.osu-md--discussions';
    injectComment(disheader, disbody, 'discussion');
}

function insertBeatmapset(){
    // beatmap description

    var header = '.beatmapset-info__header.beatmapset-info__header--sticky';
    var body = '.bbcode.bbcode--normal-line-height';
    injectIcon(header, body, 'beatmapset');

    // comment section
    var comheader = '.comment__row.comment__row--footer';
    var combody = '.comment__message .osu-md.osu-md--comment';
    injectComment(comheader, combody, 'beatmapset');
}

function insertTeams(){
    // team info

    var header = '.page-extra.page-extra--userpage .title.title--page-extra';
    var body ='.bbcode';
    injectIcon(header, body, 'teams');
}

function insertUsers(){
    // me! Section

    var header = '.js-sortable--page[data-page-id="me"] .page-extra.page-extra--userpage .u-relative h2.title.title--page-extra';
    var body ='.bbcode.bbcode--profile-page';
    injectIcon(header, body, 'userpage');
}

function insertForum(){
    // forum post

    var header = '.forum-post__content--header .forum-post__header-content';
    var body ='.bbcode';
    injectIcon(header, body, 'forum');
}

const routes = [
    {
            match: ["discussion", "discussions", "modding"],
            render: () => insertDiscussion(),
    },
    {
            match: ["beatmapsets"],
            render: () => insertBeatmapset(),
    },
    {
            match: ["teams"],
            render: () => insertTeams(),
    },
    {
            match: ["users"],
            render: () => insertUsers(),
    },
    {
            match: ["topics"],
            render: () => insertForum(),
    },
];

function determineSite(){
    function onReady(callback) {
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
            callback();
        } else {
            document.addEventListener('DOMContentLoaded', callback);
        }
    }
    onReady(() => {
        for (const route of routes){
            const splitURL = location.pathname.split("/");
            const matches = splitURL.some((u) => route.match.includes(u))
            if (matches){
                route.render();
                break;
            }
        }
    });
}

function main() {
    determineSite();

    (function () {
        const originalPushState = history.pushState;
        const originalReplaceState = history.replaceState;

        history.pushState = function (state, title, url) {
            originalPushState.apply(this, arguments);
            determineSite();
        };

        history.replaceState = function (state, title, url) {
            originalReplaceState.apply(this, arguments);
            determineSite();
        };
        // Listen for popstate event (back/forward browser buttons)
        window.addEventListener('popstate', determineSite);
    })();
}

main();