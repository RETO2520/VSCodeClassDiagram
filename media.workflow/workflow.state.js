export const state = {
    diagram: { classes: [] },
    currentOpRef: null,
    currentWorkflow: { nodes: [], edges: [] },
    nodeMap: new Map(),
};

export function setDiagram(d) { state.diagram = d || { classes: [] }; }
export function setCurrentOpRef(ref) { state.currentOpRef = ref; }
export function setWorkflow(wf) { state.currentWorkflow = wf || { nodes: [], edges: [] }; }