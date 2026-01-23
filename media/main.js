import { state, setModel, setPrimitiveTypes } from './main.state.js';
import * as utils from './main.utils.js';
import * as draw from './main.draw.js';
import * as interactions from './main.interactions.js';
import { events } from './main.events.js';

(function () {
    const vscode = acquireVsCodeApi(); // eslint-disable-line no-undef

    const dom = {
        container: document.getElementById('container'),
        canvas: document.getElementById('canvas'),
        svg: document.getElementById('relationSvg')
    };

    /**
     * Adjust the relationSvg size to match the container's scrollable area.
     * This ensures the SVG covers the entire content area, not just the visible viewport.
     */
    function adjustSvgSize() {
        const container = dom.container;
        const svg = dom.svg;
        if (!container || !svg) return;

        // Get the scrollable dimensions (total content size)
        const scrollWidth = Math.max(container.scrollWidth, container.clientWidth);
        const scrollHeight = Math.max(container.scrollHeight, container.clientHeight);

        // Apply dimensions to SVG
        svg.style.width = `${scrollWidth}px`;
        svg.style.height = `${scrollHeight}px`;
    }

    // Expose adjustSvgSize for use after rendering
    window.adjustSvgSize = adjustSvgSize;

    // Adjust SVG size on window resize
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(adjustSvgSize, 100);
    });

    // Adjust SVG size when container scrolls (content overflow)
    dom.container.addEventListener('scroll', adjustSvgSize);

    // Initialize modules with dependencies
    draw.initDrawing(vscode, dom, { utils, interactions });
    interactions.initInteractions(vscode, dom, { utils });

    // Toolbar event listeners (Identical to original)
    document.getElementById('langSelect').addEventListener('change', (event) => {
        vscode.postMessage({ command: 'changedPrimitiveTypes', language: event.target.value });
    });
    document.getElementById('addClass').addEventListener('click', () => {
        state.model.classes.push(utils.newClass(40 + state.model.classes.length * 30, 40 + state.model.classes.length * 20));
        vscode.postMessage({ command: 'showAlert', text: `model length :  ${state.model.classes.length}` });
        events.emit('requestRender');
    });
    document.getElementById('saveJson').addEventListener('click', () => vscode.postMessage({ command: 'saveJson', payload: state.model }));
    document.getElementById('loadJson').addEventListener('click', () => vscode.postMessage({ command: 'loadJson' }));
    document.getElementById('generate').addEventListener('click', () => {
        const lang = document.getElementById('langSelect').value || 'csharp';
        const exportModel = utils.modelForExport();
        vscode.postMessage({ command: 'generateCode', payload: { model: exportModel, language: lang } });
    });

    // Request initial data
    vscode.postMessage?.({ command: 'requestWorkspaceDiagram' });

    // Message handler (Identical to original)
    window.addEventListener('message', event => {
        try {
            const msg = event.data;
            if (!msg) return;

            switch (msg.command) {
                case 'loadedJson':
                    setModel(msg.payload);
                    utils.migrateModel();
                    events.emit('requestRender');
                    break;
                case 'changedPrimitiveTypes':
                    setPrimitiveTypes(msg.primitiveTypes);
                    events.emit('requestRender');
                    break;
                default:
                    break;
            }
        } catch (err) {
            console.error('Error handling message:', err);
            vscode.postMessage({ command: 'showAlert', text: 'Error in webview: ' + err.message });
        }
    });

    // Initial default class if empty (Identical to original)
    if (state.model && state.model.classes.length === 0) {
        state.model.classes.push(utils.newClass(40, 40));
        utils.migrateModel();
        events.emit('requestRender');
    } else if (!state.model) {
        // Fallback for unexpected empty model
        state.model = { classes: [utils.newClass(40, 40)] };
        utils.migrateModel();
        events.emit('requestRender');
    } else {
        // Just render if already has classes (unlikely here but safe)
        events.emit('requestRender');
    }
})();