/// <reference path="./types.d.ts" />

/**
 * @type {AppState}
 */
export const state = {
    /** @type {DiagramModel} */
    model: { classes: [] },
    /** @type {string | null} */
    editingNameId: null,
    /** @type {string} */
    editingDraft: '',
    /** @type {string[]} */
    primitiveTypes: []
};

// Simple setters to maintain same behavior

/**
 * @param {DiagramModel} newModel 
 */
export function setModel(newModel) { state.model = newModel; }

/**
 * @param {string | null} id 
 * @param {string} draft 
 */
export function setEditingName(id, draft) { state.editingNameId = id; state.editingDraft = draft; }

/**
 * @param {string[]} types 
 */
export function setPrimitiveTypes(types) { state.primitiveTypes = types; }
