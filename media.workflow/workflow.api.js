import { state, setDiagram, setWorkflow } from './workflow.state.js';
import { interactions } from './workflow.interactions.js';

export function initApi({ vscode, setDiagram: setDiagramFn, state: st, filePathSpan }) {
    window.addEventListener('message', (ev) => {
        const msg = ev.data; if (!msg || !msg.type) return;
        switch (msg.type) {
            case 'fileLoaded':
                filePathSpan.textContent = msg.filePath ? msg.filePath : '(new)';
                try { setDiagram(msg.content ? JSON.parse(msg.content) : {}); } catch (e) { console.error('Invalid JSON loaded', e); setDiagram({ classes: [] }); }
                interactions.rebuildOperationListFromDiagram();
                break;
            case 'saveCompleted':
                filePathSpan.textContent = msg.filePath;
                // Use the alert mechanism instead of raw window.alert if possible, or keep it simple
                alert('Save completed: ' + msg.filePath);
                break;
            case 'openCanceled':
            case 'saveCanceled':
                console.log('Operation canceled by user');
                break;
            case 'error':
                alert('Error: ' + msg.message);
                break;
            default:
                console.log('msg', msg);
        }
    });
}