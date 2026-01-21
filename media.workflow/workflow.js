// ...existing code...
import { getSvgPoint, computePolylineMidpoint, boundaryPointTowards, capitalize, generateId, createRect, createEllipse, createDiamond, convertToAst } from './workflow.utils.js';
import { state, setDiagram } from './workflow.state.js';
import { initDrawing } from './workflow.draw.js';
import { initInteractions } from './workflow.interactions.js';
import { initApi } from './workflow.api.js';

(() => {
	const vscode = (typeof acquireVsCodeApi !== 'undefined') ? acquireVsCodeApi() : null;

	const svg = document.getElementById('canvas');
	const nodesLayer = document.getElementById('nodes');
	const edgesLayer = document.getElementById('edges');
	const operationSelect = document.getElementById('operationSelect');
	const btnLoad = document.getElementById('btnLoad');
	const btnSave = document.getElementById('btnSave');
	const filePathSpan = document.getElementById('filePath');
	const contextMenu = document.getElementById('contextMenu');
	const edgeContextMenu = document.getElementById('edgeContextMenu');
	const createButtons = document.querySelectorAll('.createBtn');

	// 1. Initialize API and message handling first
	initApi({
		vscode,
		setDiagram,
		state,
		filePathSpan
	});

	// 2. Initialize Drawing module
	initDrawing({
		svg,
		nodesLayer,
		edgesLayer,
		getSvgPoint,
		computePolylineMidpoint,
		boundaryPointTowards,
		createRect,
		createEllipse,
		createDiamond
	});

	// 3. Initialize Interactions module
	initInteractions({
		svg,
		nodesLayer,
		edgesLayer,
		operationSelect,
		btnLoad,
		btnSave,
		filePathSpan,
		contextMenu,
		edgeContextMenu,
		createButtons,
		vscode,
		getSvgPoint,
		capitalize,
		generateId,
		convertToAst
	});

	// Request workspace diagram on start if vscode is available
	if (vscode) {
		vscode.postMessage({
			type: 'requestWorkspaceDiagram'
		});
	}
})();