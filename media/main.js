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
     * Adjust the relationSvg size to match the actual range of classes in the diagram.
     * This ensures the SVG covers all boxes even if they are at negative coordinates or
     * pushed far to the right/bottom, and adds a margin for relationship lines.
     */
    function adjustSvgSize() {
        const container = dom.container;
        const svg = dom.svg;
        if (!container || !svg) return;

        // Default to container size
        let minX = 0;
        let minY = 0;
        let maxX = container.clientWidth;
        let maxY = container.clientHeight;

        // Expand to include all classes
        if (state.model && state.model.classes && state.model.classes.length > 0) {
            for (const cls of state.model.classes) {
                minX = Math.min(minX, cls.x);
                minY = Math.min(minY, cls.y);
                // Use a default height estimate if not accurately available
                const clsHeight = cls.height || 200;
                maxX = Math.max(maxX, cls.x + (cls.width || 300));
                maxY = Math.max(maxY, cls.y + clsHeight);
            }
        }

        // Add some margin for relations, markers, and padding
        const margin = 150;
        minX -= margin;
        minY -= margin;
        maxX += margin;
        maxY += margin;

        const width = maxX - minX;
        const height = maxY - minY;

        // Apply dimensions and position to SVG
        svg.style.width = `${width}px`;
        svg.style.height = `${height}px`;
        svg.style.left = `${minX}px`;
        svg.style.top = `${minY}px`;

        // Update viewBox to match the coordinate system of the classes
        // This ensures SVG coordinates (x, y) match the class coordinates (cls.x, cls.y)
        svg.setAttribute('viewBox', `${minX} ${minY} ${width} ${height}`);
    }

    // Expose adjustSvgSize for use after rendering
    window.adjustSvgSize = adjustSvgSize;

    // Adjust SVG size on window resize (debounced)
    let resizeTimeout;
    const debouncedAdjustSize = () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(adjustSvgSize, 100);
    };

    window.addEventListener('resize', debouncedAdjustSize);

    // Adjust SVG size when container scrolls (debounced)
    dom.container.addEventListener('scroll', debouncedAdjustSize);

    // Use ResizeObserver for more robust size tracking of the container itself
    if (typeof ResizeObserver !== 'undefined') {
        const ro = new ResizeObserver(() => {
            adjustSvgSize();
        });
        ro.observe(dom.container);
    }

    // Initialize modules with dependencies
    draw.initDrawing(vscode, dom, { utils, interactions });
    interactions.initInteractions(vscode, dom, { utils });

    // Toolbar event listeners (Identical to original)
    document.getElementById('langSelect').addEventListener('change', (event) => {
        vscode.postMessage({ command: 'changedPrimitiveTypes', language: event.target.value });
    });
    document.getElementById('addClass').addEventListener('click', () => {
        state.model.classes.push(utils.newClass(40 + state.model.classes.length * 30, 40 + state.model.classes.length * 20));
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