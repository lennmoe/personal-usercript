// ==UserScript==
// @name         osu! crop
// @namespace    https://osu.ppy.sh/
// @version      3.0.0
// @description  adds crop/resize interface to osu! avatar upload 
// @match        https://osu.ppy.sh/home/account/edit*
// @require      https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.6.2/cropper.min.js
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.6.2/cropper.min.css';
    document.head.appendChild(link);

    const style = document.createElement('style');
    style.textContent = `

        /* ── GIF warning ── */
        #acrop-gif-warning {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 10px 14px;
            border-radius: 10px;
            background: rgba(255, 180, 50, 0.1);
            border: 1px solid rgba(255, 180, 50, 0.25);
        }
        #acrop-gif-warning svg {
            flex-shrink: 0;
            color: #ffb432;
        }
        #acrop-gif-warning span {
            color: #ddc080;
            font-size: 11.5px;
            font-family: 'Torus', 'Quicksand', sans-serif;
            line-height: 1.5;
            letter-spacing: 0.01em;
        }
        #acrop-use-original {
            background: rgba(255, 180, 50, 0.12);
            color: #ffcc66;
            border: 1px solid rgba(255, 180, 50, 0.3);
        }
        #acrop-use-original:hover {
            background: rgba(255, 180, 50, 0.22);
            color: #ffdd88;
        }
        #acrop-use-original:active { transform: scale(0.96); }

        /* ── progress overlay ── */
        #acrop-progress-overlay {
            position: absolute;
            inset: 0;
            background: rgba(17, 17, 27, 0.92);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 14px;
            border-radius: 12px;
            z-index: 10;
        }
        #acrop-progress-text {
            color: #a0a0c0;
            font-size: 13px;
            font-family: 'Torus', 'Quicksand', sans-serif;
            letter-spacing: 0.03em;
        }
        #acrop-progress-bar-wrap {
            width: 60%;
            height: 6px;
            background: rgba(255,255,255,0.06);
            border-radius: 3px;
            overflow: hidden;
        }
        #acrop-progress-bar {
            height: 100%;
            width: 0%;
            background: linear-gradient(90deg, #888, #bbb);
            border-radius: 3px;
            transition: width 0.15s ease;
        }

        @keyframes acrop-overlay-in {
            from { opacity: 0; }
            to   { opacity: 1; }
        }
        @keyframes acrop-box-in {
            from { opacity: 0; transform: scale(0.92) translateY(12px); }
            to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes acrop-overlay-out {
            from { opacity: 1; }
            to   { opacity: 0; }
        }
        @keyframes acrop-box-out {
            from { opacity: 1; transform: scale(1) translateY(0); }
            to   { opacity: 0; transform: scale(0.92) translateY(12px); }
        }

        /* ── overlay ── */
        #acrop-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.75);
            z-index: 999999;
            display: flex;
            align-items: center;
            justify-content: center;
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            animation: acrop-overlay-in 0.3s ease-out forwards;
        }
        #acrop-overlay.acrop-closing {
            animation: acrop-overlay-out 0.25s ease-in forwards;
        }

        #acrop-box {
            background: #1e1e2e;
            border-radius: 16px;
            padding: 0;
            display: flex;
            flex-direction: column;
            width: min(680px, 94vw);
            overflow: hidden;
            box-shadow:
                0 0 0 1px rgba(255, 255, 255, 0.08),
                0 24px 64px rgba(0, 0, 0, 0.7);
            animation: acrop-box-in 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        #acrop-overlay.acrop-closing #acrop-box {
            animation: acrop-box-out 0.25s ease-in forwards;
        }

        #acrop-header {
            background: #2a2a3a;
            padding: 16px 24px;
            display: flex;
            align-items: center;
            gap: 12px;
        }
        #acrop-header-icon {
            width: 28px;
            height: 28px;
            flex-shrink: 0;
            position: relative;
            z-index: 1;
        }
        #acrop-header h2 {
            color: #fff;
            margin: 0;
            font-size: 15px;
            font-family: 'Torus', 'Quicksand', sans-serif;
            font-weight: 700;
            letter-spacing: 0.06em;
            position: relative;
            z-index: 1;
            text-shadow: 0 1px 4px rgba(0,0,0,0.25);
        }

        #acrop-body {
            padding: 20px 24px 24px;
            display: flex;
            flex-direction: column;
            gap: 16px;
        }

        #acrop-hint {
            color: #8888aa;
            font-size: 12px;
            font-family: 'Torus', 'Quicksand', sans-serif;
            margin: 0;
            letter-spacing: 0.02em;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        #acrop-hint svg {
            flex-shrink: 0;
            opacity: 0.6;
        }

        #acrop-wrap {
            width: 100%;
            height: min(420px, 56vh);
            background: #11111b;
            overflow: hidden;
            border-radius: 12px;
            border: 1px solid rgba(255, 255, 255, 0.06);
            position: relative;
        }
        #acrop-wrap img {
            display: block;
            max-width: 100%;
        }


        #acrop-bottom {
            display: flex;
            align-items: center;
            gap: 6px;
            flex-wrap: wrap;
        }
        #acrop-bottom .acrop-tool-group {
            display: flex;
            align-items: center;
            gap: 2px;
            background: rgba(255, 255, 255, 0.04);
            border-radius: 8px;
            padding: 4px;
        }
        .acrop-tool-btn {
            background: transparent;
            border: none;
            border-radius: 6px;
            color: #a0a0c0;
            width: 34px;
            height: 34px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: all 0.15s ease;
            position: relative;
        }
        .acrop-tool-btn svg {
            width: 17px;
            height: 17px;
            pointer-events: none;
        }
        .acrop-tool-btn:hover {
            background: rgba(255, 255, 255, 0.1);
            color: #fff;
        }
        .acrop-tool-btn:active {
            background: rgba(255, 255, 255, 0.15);
            transform: scale(0.92);
        }
        .acrop-tool-btn[data-tooltip]:hover::after {
            content: attr(data-tooltip);
            position: absolute;
            bottom: calc(100% + 6px);
            left: 50%;
            transform: translateX(-50%);
            background: #2a2a3e;
            color: #ccc;
            font-size: 10px;
            font-family: 'Torus', 'Quicksand', sans-serif;
            padding: 4px 8px;
            border-radius: 4px;
            white-space: nowrap;
            pointer-events: none;
            border: 1px solid rgba(255,255,255,0.08);
            z-index: 10;
        }

        #acrop-bottom-spacer { flex: 1; }



        /* ── action buttons ── */
        #acrop-actions {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .acrop-btn {
            border: none;
            border-radius: 24px;
            padding: 10px 28px;
            font-size: 13px;
            font-weight: 700;
            cursor: pointer;
            font-family: 'Torus', 'Quicksand', sans-serif;
            letter-spacing: 0.05em;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .acrop-btn:disabled {
            opacity: 0.4;
            cursor: not-allowed;
            pointer-events: none;
        }
        #acrop-cancel {
            background: rgba(255, 255, 255, 0.06);
            color: #a0a0c0;
            border: 1px solid rgba(255, 255, 255, 0.08);
        }
        #acrop-cancel:hover {
            background: rgba(255, 255, 255, 0.1);
            color: #d0d0e0;
        }
        #acrop-cancel:active { transform: scale(0.96); }
        #acrop-apply {
            background: linear-gradient(135deg, #555, #444);
            color: #fff;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }
        #acrop-apply:hover {
            background: linear-gradient(135deg, #666, #555);
            box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4);
            transform: translateY(-1px);
        }
        #acrop-apply:active {
            transform: translateY(0) scale(0.97);
        }

        /* ── cropper overrides ── */
        #acrop-wrap .cropper-view-box {
            outline: 2px solid rgba(255, 255, 255, 0.7);
            outline-offset: -1px;
        }
        #acrop-wrap .cropper-face {
            background-color: rgba(255, 255, 255, 0.03);
        }
        #acrop-wrap .cropper-line {
            background-color: rgba(255, 255, 255, 0.35);
        }
        #acrop-wrap .cropper-point {
            background-color: #fff;
            width: 8px !important;
            height: 8px !important;
            opacity: 0.9;
        }
        #acrop-wrap .cropper-dashed {
            border-color: rgba(255, 255, 255, 0.2);
        }
        #acrop-wrap .cropper-modal {
            background-color: #11111b;
            opacity: 0.7;
        }

        /* ── responsive ── */
        @media (max-width: 480px) {
            #acrop-bottom {
                justify-content: center;
            }
            #acrop-bottom-spacer {
                display: none;
            }
            #acrop-actions {
                width: 100%;
                justify-content: flex-end;
            }
        }
    `;
    document.head.appendChild(style);


    const ICONS = {
        crop: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 2v6m0 6v8M2 6h6m6 0h8M18 10v12m0-6h4M6 6h12v12H6z"/></svg>`,
        rotateL: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>`,
        rotateR: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>`,
        flipH: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2v20M16 6l4 6-4 6M8 6 4 12l4 6"/></svg>`,
        flipV: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 12h20M6 8l6-4 6 4M6 16l6 4 6-4"/></svg>`,
        reset: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 1 3 6.7L3 21v-6h6"/></svg>`,
        info: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4m0-4h.01"/></svg>`,
        osu: `<svg viewBox="0 0 24 24" fill="white"><circle cx="12" cy="12" r="10" fill="none" stroke="white" stroke-width="1.5"/><circle cx="12" cy="12" r="6" fill="none" stroke="white" stroke-width="1.5"/><circle cx="12" cy="12" r="2.5" fill="white"/></svg>`,
        check: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M5 12l5 5L19 7"/></svg>`,
        warn: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
        upload: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`,
    };

    let cropperInst = null;
    let targetInput = null;
    let currentFile = null;
    let currentGifBuffer = null;

    // ── GIF library loading (fetch + blob to avoid cross-origin worker issues) ──
    let _gifLibsReady = null;
    let _gifWorkerBlobUrl = null;
    let _parseGIF = null;
    let _decompressFrames = null;

    async function loadGifLibs() {
        if (_gifLibsReady) return _gifLibsReady;
        _gifLibsReady = (async () => {
            // 1. Load gif.js (encoder) — fetch and eval as script
            if (typeof GIF === 'undefined') {
                const gifScript = await fetch('https://cdn.jsdelivr.net/npm/gif.js@0.2.0/dist/gif.js').then(r => r.text());
                const s = document.createElement('script');
                s.textContent = gifScript;
                document.head.appendChild(s);
            }

            // 2. Load gif.js worker as blob URL (workers can't load cross-origin)
            const workerCode = await fetch('https://cdn.jsdelivr.net/npm/gif.js@0.2.0/dist/gif.worker.js').then(r => r.text());
            _gifWorkerBlobUrl = URL.createObjectURL(new Blob([workerCode], { type: 'application/javascript' }));

            // 3. Load gifuct-js (parser) via dynamic import from jsdelivr ESM
            try {
                const mod = await import('https://cdn.jsdelivr.net/npm/gifuct-js@2.1.2/+esm');
                _parseGIF = mod.parseGIF;
                _decompressFrames = mod.decompressFrames;
            } catch (e) {
                // Fallback: fetch the CommonJS source and evaluate it
                console.warn('[osu! crop] ESM import failed, using fetch fallback', e);
                const libFiles = [
                    'https://unpkg.com/js-binary-schema-parser@2.0.3/lib/schemas/gif.js',
                    'https://unpkg.com/js-binary-schema-parser@2.0.3/lib/index.js',
                    'https://unpkg.com/js-binary-schema-parser@2.0.3/lib/parsers/uint8.js',
                    'https://unpkg.com/gifuct-js@2.1.2/lib/deinterlace.js',
                    'https://unpkg.com/gifuct-js@2.1.2/lib/lzw.js',
                    'https://unpkg.com/gifuct-js@2.1.2/lib/index.js',
                ];
                // Use the ESM version with a module script tag
                const esmUrl = 'https://cdn.jsdelivr.net/npm/gifuct-js@2.1.2/+esm';
                const code = await fetch(esmUrl).then(r => r.text());
                // Create a module script that exposes the functions globally
                const moduleCode = `
                    import { parseGIF, decompressFrames } from 'https://cdn.jsdelivr.net/npm/gifuct-js@2.1.2/+esm';
                    window.__gifuct_parseGIF = parseGIF;
                    window.__gifuct_decompressFrames = decompressFrames;
                `;
                const blob = new Blob([moduleCode], { type: 'application/javascript' });
                const blobUrl = URL.createObjectURL(blob);
                const script = document.createElement('script');
                script.type = 'module';
                script.src = blobUrl;
                document.head.appendChild(script);
                // Wait for the module to load
                await new Promise((resolve, reject) => {
                    script.onload = resolve;
                    script.onerror = reject;
                });
                // Give it a moment to execute
                await new Promise(r => setTimeout(r, 200));
                _parseGIF = window.__gifuct_parseGIF;
                _decompressFrames = window.__gifuct_decompressFrames;
                URL.revokeObjectURL(blobUrl);
            }

            if (!_parseGIF || !_decompressFrames) {
                throw new Error('Failed to load gifuct-js');
            }
        })();
        return _gifLibsReady;
    }

    function openModal(src, isGif) {
        const overlay = document.createElement('div');
        overlay.id = 'acrop-overlay';
        overlay.innerHTML = `
            <div id="acrop-box">
                <div id="acrop-header">
                    <span id="acrop-header-icon">${ICONS.osu}</span>
                    <h2>crop avatar!</h2>
                </div>
                <div id="acrop-body">
                    ${isGif ? `<div id="acrop-gif-warning">
                        ${ICONS.warn}
                        <span>this is an animated GIF — the crop will preserve animation!</span>
                    </div>` : ''}
                    <p id="acrop-hint">
                        ${ICONS.info}
                        drag to reposition &middot; resize the selection &middot; scroll to zoom
                    </p>
                    <div id="acrop-wrap"><img id="acrop-img" src="${src}" alt=""></div>
                    <div id="acrop-bottom">
                        <div class="acrop-tool-group">
                            <button class="acrop-tool-btn" id="acrop-rot-l" data-tooltip="rotate left">${ICONS.rotateL}</button>
                            <button class="acrop-tool-btn" id="acrop-rot-r" data-tooltip="rotate right">${ICONS.rotateR}</button>
                        </div>
                        <div class="acrop-tool-group">
                            <button class="acrop-tool-btn" id="acrop-flip-h" data-tooltip="flip horizontal">${ICONS.flipH}</button>
                            <button class="acrop-tool-btn" id="acrop-flip-v" data-tooltip="flip vertical">${ICONS.flipV}</button>
                        </div>
                        <div class="acrop-tool-group">
                            <button class="acrop-tool-btn" id="acrop-reset" data-tooltip="reset">${ICONS.reset}</button>
                        </div>
                        <div id="acrop-bottom-spacer"></div>

                        <div id="acrop-actions">
                            <button class="acrop-btn" id="acrop-cancel">cancel</button>
                            ${isGif ? `<button class="acrop-btn" id="acrop-use-original">${ICONS.upload} upload original</button>` : ''}
                            <button class="acrop-btn" id="acrop-apply">${ICONS.check} apply</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const img = document.getElementById('acrop-img');
        cropperInst = new Cropper(img, {
            aspectRatio: 1,
            viewMode: 1,
            dragMode: 'move',
            autoCropArea: 0.85,
            guides: false,
            highlight: false,
            cropBoxMovable: true,
            cropBoxResizable: true,
        });

        document.getElementById('acrop-apply').onclick = isGif ? doApplyGif : doApply;
        document.getElementById('acrop-cancel').onclick = animateClose;
        document.getElementById('acrop-rot-l').onclick = () => cropperInst.rotate(-90);
        document.getElementById('acrop-rot-r').onclick = () => cropperInst.rotate(90);
        document.getElementById('acrop-flip-h').onclick = () => {
            const d = cropperInst.getData();
            cropperInst.scaleX(d.scaleX === -1 ? 1 : -1);
        };
        document.getElementById('acrop-flip-v').onclick = () => {
            const d = cropperInst.getData();
            cropperInst.scaleY(d.scaleY === -1 ? 1 : -1);
        };
        document.getElementById('acrop-reset').onclick = () => {
            cropperInst.reset();
        };

        const useOrigBtn = document.getElementById('acrop-use-original');
        if (useOrigBtn) {
            useOrigBtn.onclick = doUploadOriginal;
        }


        overlay.addEventListener('mousedown', (e) => {
            if (e.target === overlay) animateClose();
        });

        overlay._escHandler = (e) => {
            if (e.key === 'Escape') animateClose();
        };
        document.addEventListener('keydown', overlay._escHandler);
    }

    function animateClose() {
        const overlay = document.getElementById('acrop-overlay');
        if (!overlay) return;
        overlay.classList.add('acrop-closing');
        document.removeEventListener('keydown', overlay._escHandler);
        setTimeout(() => {
            cropperInst?.destroy();
            cropperInst = null;
            overlay.remove();
        }, 250);
    }

    function closeModal() {
        cropperInst?.destroy();
        cropperInst = null;
        document.getElementById('acrop-overlay')?.remove();
    }

    function showProgress(text) {
        const wrap = document.getElementById('acrop-wrap');
        if (!wrap) return;
        // Remove existing progress overlay
        const existing = document.getElementById('acrop-progress-overlay');
        if (existing) existing.remove();

        const el = document.createElement('div');
        el.id = 'acrop-progress-overlay';
        el.innerHTML = `
            <div id="acrop-progress-text">${text}</div>
            <div id="acrop-progress-bar-wrap">
                <div id="acrop-progress-bar"></div>
            </div>
        `;
        wrap.appendChild(el);
    }

    function updateProgress(pct, text) {
        const bar = document.getElementById('acrop-progress-bar');
        if (bar) bar.style.width = pct + '%';
        if (text) {
            const txt = document.getElementById('acrop-progress-text');
            if (txt) txt.textContent = text;
        }
    }

    function setButtonsDisabled(disabled) {
        const btns = document.querySelectorAll('#acrop-actions .acrop-btn, .acrop-tool-btn');
        btns.forEach(btn => btn.disabled = disabled);
    }

    // ── Standard PNG crop (non-GIF) ──
    function doApply() {
        if (!cropperInst || !targetInput) return;

        const canvas = cropperInst.getCroppedCanvas({ width: 256, height: 256 });
        canvas.toBlob(blob => {
            const dt = new DataTransfer();
            dt.items.add(new File([blob], 'avatar.png', { type: 'image/png' }));
            targetInput.files = dt.files;
            targetInput._skipCrop = true;
            animateClose();
            setTimeout(() => {
                targetInput.dispatchEvent(new Event('change', { bubbles: true }));
            }, 260);
        }, 'image/png');
    }

    // ── Animated GIF crop ──
    const GIF_MAX_SIZE = 128;
    const GIF_MAX_BYTES = 87 * 1024; // 87 KB

    // Renders cropped frames into a GIF blob at given quality/size/frameSet
    function encodeGif(croppedFrames, outSize, quality, onProgress) {
        return new Promise((resolve) => {
            const encoder = new GIF({
                workers: 2,
                quality: quality,
                width: outSize,
                height: outSize,
                workerScript: _gifWorkerBlobUrl,
            });

            for (const { canvas, delay } of croppedFrames) {
                encoder.addFrame(canvas, { delay, copy: true });
            }

            if (onProgress) encoder.on('progress', onProgress);
            encoder.on('finished', (blob) => resolve(blob));
            encoder.render();
        });
    }

    // Builds cropped frame canvases from parsed GIF data
    function buildCroppedFrames(frames, gifWidth, gifHeight, cx, cy, cw, ch, outSize, frameIndices) {
        const fullCanvas = document.createElement('canvas');
        fullCanvas.width = gifWidth;
        fullCanvas.height = gifHeight;
        const fullCtx = fullCanvas.getContext('2d');

        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = outSize;
        cropCanvas.height = outSize;
        const cropCtx = cropCanvas.getContext('2d');

        const results = [];

        for (let i = 0; i < frames.length; i++) {
            const frame = frames[i];
            const dims = frame.dims;

            // Handle disposal
            if (i > 0) {
                const prevFrame = frames[i - 1];
                if (prevFrame.disposalType === 2) {
                    fullCtx.clearRect(
                        prevFrame.dims.left, prevFrame.dims.top,
                        prevFrame.dims.width, prevFrame.dims.height
                    );
                }
            }

            // Draw this frame's patch onto the full canvas
            const frameImageData = new ImageData(
                new Uint8ClampedArray(frame.patch),
                dims.width,
                dims.height
            );
            const patchCanvas = document.createElement('canvas');
            patchCanvas.width = dims.width;
            patchCanvas.height = dims.height;
            patchCanvas.getContext('2d').putImageData(frameImageData, 0, 0);
            fullCtx.drawImage(patchCanvas, dims.left, dims.top);

            // Only include this frame if it's in our selected indices
            if (!frameIndices.includes(i)) continue;

            // Crop from full composite to output canvas
            cropCtx.clearRect(0, 0, outSize, outSize);
            cropCtx.drawImage(fullCanvas, cx, cy, cw, ch, 0, 0, outSize, outSize);

            // Copy to a new canvas (gif.js needs its own canvas per frame)
            const out = document.createElement('canvas');
            out.width = outSize;
            out.height = outSize;
            out.getContext('2d').drawImage(cropCanvas, 0, 0);

            // When dropping frames, double the delay to keep overall animation speed
            const frameStep = frames.length / frameIndices.length;
            results.push({
                canvas: out,
                delay: Math.round((frame.delay || 100) * frameStep),
            });
        }

        return results;
    }

    async function doApplyGif() {
        if (!cropperInst || !targetInput || !currentGifBuffer) return;

        setButtonsDisabled(true);
        showProgress('parsing GIF frames…');

        try {
            await loadGifLibs();
            const parseGIF = _parseGIF;
            const decompressFrames = _decompressFrames;

            const gif = parseGIF(currentGifBuffer);
            const frames = decompressFrames(gif, true);

            if (!frames || frames.length === 0) {
                doApply();
                return;
            }

            const cropData = cropperInst.getData(true);
            const gifWidth = gif.lsd.width;
            const gifHeight = gif.lsd.height;

            const cx = Math.max(0, Math.round(cropData.x));
            const cy = Math.max(0, Math.round(cropData.y));
            const cw = Math.round(cropData.width);
            const ch = Math.round(cropData.height);

            const outSize = GIF_MAX_SIZE; // 128x128

            // Strategy: try progressively worse quality, then drop frames if needed
            // quality in gif.js = pixel sample interval (1=best, higher=worse but smaller)
            const qualitySteps = [10, 20, 30, 50, 80, 120];
            const dropLevels = [1, 2, 3, 4]; // 1 = keep all, 2 = every other, 3 = every 3rd, etc.

            let finalBlob = null;
            let attempt = 0;
            const totalAttempts = qualitySteps.length * dropLevels.length;

            for (const drop of dropLevels) {
                // Build frame index list
                const frameIndices = [];
                for (let i = 0; i < frames.length; i++) {
                    if (i % drop === 0) frameIndices.push(i);
                }
                // Always need at least 2 frames for animation
                if (frameIndices.length < 2 && frames.length >= 2) {
                    frameIndices.length = 0;
                    frameIndices.push(0, frames.length - 1);
                }

                for (const q of qualitySteps) {
                    attempt++;
                    const dropLabel = drop > 1 ? `, dropping ${Math.round((1 - 1 / drop) * 100)}% frames` : '';
                    updateProgress(
                        Math.round((attempt / totalAttempts) * 100),
                        `attempt ${attempt}: quality=${q}${dropLabel} (${frameIndices.length} frames)…`
                    );

                    const croppedFrames = buildCroppedFrames(
                        frames, gifWidth, gifHeight,
                        cx, cy, cw, ch, outSize, frameIndices
                    );

                    const blob = await encodeGif(croppedFrames, outSize, q, (p) => {
                        updateProgress(
                            Math.round((attempt / totalAttempts) * 100),
                            `encoding… quality=${q}${dropLabel}`
                        );
                    });

                    const sizeKB = (blob.size / 1024).toFixed(1);
                    console.log(`[osu! crop] attempt ${attempt}: q=${q}, drop=${drop}, frames=${frameIndices.length}, size=${sizeKB}KB`);

                    if (blob.size <= GIF_MAX_BYTES) {
                        finalBlob = blob;
                        break;
                    }
                }

                if (finalBlob) break;
            }

            // If still too large after all attempts, use the last blob anyway with a warning
            if (!finalBlob) {
                console.warn('[osu! crop] Could not fit GIF under 87KB, using best effort result');
                // Last resort: just encode with maximum compression
                const lastFrameIndices = [0, Math.floor(frames.length / 2), frames.length - 1]
                    .filter((v, i, a) => a.indexOf(v) === i);
                const lastCropped = buildCroppedFrames(
                    frames, gifWidth, gifHeight,
                    cx, cy, cw, ch, outSize, lastFrameIndices
                );
                finalBlob = await encodeGif(lastCropped, outSize, 120);
            }

            const finalSizeKB = (finalBlob.size / 1024).toFixed(1);
            updateProgress(100, `done! final size: ${finalSizeKB}KB`);

            // Brief delay so user can see the final size
            await new Promise(r => setTimeout(r, 600));

            const dt = new DataTransfer();
            dt.items.add(new File([finalBlob], 'avatar.gif', { type: 'image/gif' }));
            targetInput.files = dt.files;
            targetInput._skipCrop = true;
            animateClose();
            setTimeout(() => {
                targetInput.dispatchEvent(new Event('change', { bubbles: true }));
            }, 260);

        } catch (err) {
            console.error('[osu! crop] GIF processing error:', err);
            setButtonsDisabled(false);
            const progOverlay = document.getElementById('acrop-progress-overlay');
            if (progOverlay) progOverlay.remove();
            doApply();
        }
    }

    function doUploadOriginal() {
        if (!targetInput || !currentFile) return;

        const dt = new DataTransfer();
        dt.items.add(currentFile);
        targetInput.files = dt.files;
        targetInput._skipCrop = true;
        animateClose();
        setTimeout(() => {
            targetInput.dispatchEvent(new Event('change', { bubbles: true }));
        }, 260);
    }

    window.addEventListener('change', function (e) {
        const input = e.target;
        if (input.type !== 'file') return;

        if (input._skipCrop) {
            input._skipCrop = false;
            return;
        }

        const file = input.files[0];
        if (!file?.type.startsWith('image/')) return;

        e.stopImmediatePropagation();

        targetInput = input;
        currentFile = file;
        const isGif = file.type === 'image/gif';

        if (isGif) {
            // Read both as DataURL (for preview) and ArrayBuffer (for frame parsing)
            const readerURL = new FileReader();
            readerURL.onload = ev => {
                const readerBuf = new FileReader();
                readerBuf.onload = bufEv => {
                    currentGifBuffer = bufEv.target.result;
                    openModal(ev.target.result, true);
                };
                readerBuf.readAsArrayBuffer(file);
            };
            readerURL.readAsDataURL(file);
        } else {
            currentGifBuffer = null;
            const reader = new FileReader();
            reader.onload = ev => openModal(ev.target.result, false);
            reader.readAsDataURL(file);
        }
    }, true);

})();
