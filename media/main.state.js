export const state = {
    model: { classes: [] },
    editingNameId: null,
    editingDraft: '',
    primitiveTypes: []
};

// Simple setters to maintain same behavior
export function setModel(newModel) { state.model = newModel; }
export function setEditingName(id, draft) { state.editingNameId = id; state.editingDraft = draft; }
export function setPrimitiveTypes(types) { state.primitiveTypes = types; }
