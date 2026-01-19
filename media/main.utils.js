import { state } from './main.state.js';

/** @returns {object} */
export function newAttribute(name = 'field', type = 'int') {
    return { name, type, visibility: 'private', modifier: 'None' };
}

/** @returns {object} */
export function newOperation(name = 'Op', returnType = 'void') {
    return { name, returnType, visibility: 'private', modifier: 'None', parameters: [] };
}

/** @returns {object} */
export function newClass(x = 20, y = 20) {
    return {
        id: cryptoRandomId(),
        name: 'NewClass',
        x, y,
        width: 400,
        height: 120,
        baseClassId: null,
        interfaces: [],
        isAbstract: false,
        isInterface: false,
        attributes: [],
        operations: []
    };
}

export function cryptoRandomId() { return Math.random().toString(36).slice(2, 10); }

export function migrateModel() {
    const model = state.model;
    // build maps
    const nameToId = {};
    const idToClass = {};
    for (const c of model.classes || []) {
        if (!c.id) c.id = cryptoRandomId(); // ensure id present
        nameToId[c.name] = c.id;
        idToClass[c.id] = c;
    }

    for (const c of model.classes || []) {
        if (!Array.isArray(c.interfaces)) c.interfaces = [];
        if (typeof c.isAbstract === 'undefined') c.isAbstract = false;
        if (typeof c.isInterface === 'undefined') c.isInterface = false;
        if (!Array.isArray(c.attributes)) c.attributes = [];
        if (!Array.isArray(c.operations)) c.operations = [];

        c.interfaces = c.interfaces.map(it => {
            if (!it) return null;
            if (idToClass[it]) return it;
            if (nameToId[it]) return nameToId[it];
            return null;
        }).filter(x => !!x);

        if (typeof c.baseClassId === 'undefined') {
            if (c.baseClass && nameToId[c.baseClass]) {
                c.baseClassId = nameToId[c.baseClass];
            } else {
                c.baseClassId = null;
            }
        } else {
            if (c.baseClassId && !idToClass[c.baseClassId] && nameToId[c.baseClassId]) {
                c.baseClassId = nameToId[c.baseClassId];
            }
            if (c.baseClassId && !idToClass[c.baseClassId]) c.baseClassId = null;
        }
    }

    const validIds = new Set((model.classes || []).map(c => c.id));
    for (const c of model.classes || []) {
        c.interfaces = c.interfaces.filter(id => validIds.has(id));
    }
}

export function modelForExport() {
    const model = state.model;
    const idToName = {};
    for (const c of model.classes) idToName[c.id] = c.name;

    const copy = { classes: [] };
    for (const c of model.classes) {
        const cc = JSON.parse(JSON.stringify(c));
        cc.baseClass = c.baseClassId ? idToName[c.baseClassId] : 'None';
        copy.classes.push(cc);
    }
    return copy;
}

export function cleanupReferencesById(deletedId) {
    const model = state.model;
    if (!deletedId) return;
    const deleted = model.classes.find(c => c.id === deletedId);
    const deletedName = deleted ? deleted.name : null;
    for (const c of model.classes) {
        if (Array.isArray(c.interfaces) && c.interfaces.length > 0) {
            c.interfaces = c.interfaces.filter(id => id !== deletedId);
        }
        if (c.baseClassId === deletedId) {
            c.baseClassId = null;
        }
        if (deletedName && c.baseClass === deletedName) {
            c.baseClass = 'None';
        }
        for (const a of c.attributes || []) {
            if (a.type === deletedName) a.type = 'object';
        }
        for (const o of c.operations || []) {
            if (o.returnType === deletedName) o.returnType = 'void';
            for (const p of o.parameters || []) {
                if (p.type === deletedName) p.type = 'object';
            }
        }
    }
}

export function cleanupReferences(deletedName) {
    const model = state.model;
    if (!deletedName) return;
    for (const c of model.classes) {
        if (Array.isArray(c.interfaces) && c.interfaces.length > 0) {
            c.interfaces = c.interfaces.filter(name => name !== deletedName);
        }
        if (c.baseClass === deletedName) {
            c.baseClass = 'None';
        }
    }
}
