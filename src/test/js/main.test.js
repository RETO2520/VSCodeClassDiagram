const assert = require('assert');

function modelForExport(model) {
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

function computeRelationsFromModel(model) {
    const rels = [];
    const nameToId = {};
    const idToClass = {};
    for (const c of model.classes) {
        nameToId[c.name] = c.id;
        idToClass[c.id] = c;
    }

    for (const c of model.classes) {
        if (c.baseClassId && idToClass[c.baseClassId]) {
            rels.push({ fromId: c.id, toId: c.baseClassId, type: 'Inheritance' });
        }
        if (Array.isArray(c.interfaces)) {
            for (const iid of c.interfaces) {
                if (idToClass[iid]) rels.push({ fromId: c.id, toId: iid, type: 'Interface' });
            }
        }
        for (const a of c.attributes || []) {
            if (a.type && nameToId[a.type]) {
                const mod = (a.modifier || '').toLowerCase();
                if (mod === 'composition') rels.push({ fromId: c.id, toId: nameToId[a.type], type: 'Composition', origin: 'attr:' + a.name });
                else if (mod === 'aggregation') rels.push({ fromId: c.id, toId: nameToId[a.type], type: 'Aggregation', origin: 'attr:' + a.name });
                else rels.push({ fromId: c.id, toId: nameToId[a.type], type: 'Association', origin: 'attr:' + a.name });
            }
        }
        for (const op of c.operations || []) {
            if (op.returnType && nameToId[op.returnType]) rels.push({ fromId: c.id, toId: nameToId[op.returnType], type: 'Dependency', origin: 'ret:' + op.name });
            for (const p of op.parameters || []) {
                if (p.type && nameToId[p.type]) rels.push({ fromId: c.id, toId: nameToId[p.type], type: 'Dependency', origin: 'param:' + op.name + ':' + p.name });
            }
        }
    }
    return rels;
}

// --- Tests ---
function runTests() {
    console.log('--- Testing main.test.js (Legacy Relations) ---');
    try {
        const A = { id: 'a', name: 'A' };
        const B = { id: 'b', name: 'B', baseClassId: 'a' };
        const model = { classes: [A, B] };

        const exported = modelForExport(model);
        assert.strictEqual(exported.classes.length, 2);
        const bExp = exported.classes.find(x => x.id === 'b');
        assert.strictEqual(bExp.baseClass, 'A', 'baseClassId should be converted to baseClass name');

        // relation tests
        const C = { id: 'c', name: 'C', attributes: [{ name: 'f', type: 'A', modifier: 'composition' }], operations: [{ name: 'op', returnType: 'B', parameters: [{ name: 'p', type: 'A' }] }] };
        const model2 = { classes: [A, B, C] };
        const rels = computeRelationsFromModel(model2);
        // expect composition from C->A, dependency C->B (return), dependency C->A (param), inheritance B->A
        const types = rels.map(r => r.type);
        assert(types.includes('Composition'));
        assert(types.includes('Dependency'));
        assert(types.includes('Inheritance'));

        console.log('main.test.js passed! ✅');
    } catch (err) {
        console.error('main.test.js failed: ❌', err && err.stack || err);
        throw err;
    }
}

module.exports = { runTests };

if (require.main === module) {
    runTests();
}
