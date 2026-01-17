// ...existing code...
import { getSvgPoint, computePolylineMidpoint, boundaryPointTowards, capitalize, generateId, createRect, createEllipse, createDiamond } from './workflow.utils.js';
import { state, setDiagram } from './workflow.state.js';
import { initDrawing } from './workflow.draw.js';
import { initInteractions } from './workflow.interactions.js';
import { initApi } from './workflow.api.js';

(() => {
	const vscode = acquireVsCodeApi?.();// eslint-disable-line no-undef
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
	// request workspace diagram on start
	vscode.postMessage?.({
		type: 'requestWorkspaceDiagram'
	});
	// initialize modules with element refs and helpers
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
		generateId
	});
	initApi({
		vscode,
		setDiagram,
		state,
		filePathSpan
	});


})();