const assert = require('assert');
const path = require('path');

// Helper to run ESM in a CJS environment
(async () => {
    try {
        // Use dynamic import to load ESM modules
        const utilsPath = 'file://' + path.resolve(__dirname, '../../../media/main.utils.js').replace(/\\/g, '/');
        const statePath = 'file://' + path.resolve(__dirname, '../../../media/main.state.js').replace(/\\/g, '/');

        const utils = await import(utilsPath);
        const { state } = await import(statePath);

        console.log('--- Testing main.utils.js ---');

        // 1. Test newAttribute
        console.log('Testing newAttribute...');
        const attr = utils.newAttribute('name', 'string');
        assert.strictEqual(attr.name, 'name');
        assert.strictEqual(attr.type, 'string');
        assert.strictEqual(attr.visibility, 'private');
        assert.strictEqual(attr.modifier, 'None');

        // 2. Test newOperation
        console.log('Testing newOperation...');
        const op = utils.newOperation('doWork', 'int');
        assert.strictEqual(op.name, 'doWork');
        assert.strictEqual(op.returnType, 'int');
        assert.strictEqual(op.parameters.length, 0);

        // 3. Test generateId
        console.log('Testing generateId...');
        const id1 = utils.generateId();
        const id2 = utils.generateId();
        assert.ok(id1 && id1.length > 0);
        assert.notStrictEqual(id1, id2, 'IDs should be unique');

        // 4. Test newClass
        console.log('Testing newClass...');
        const cls = utils.newClass(100, 200);
        assert.strictEqual(cls.name, 'NewClass');
        assert.strictEqual(cls.x, 100);
        assert.strictEqual(cls.y, 200);
        assert.ok(cls.id);
        assert.ok(Array.isArray(cls.attributes));
        assert.ok(Array.isArray(cls.operations));

        // 5. Test migrateModel
        console.log('Testing migrateModel...');
        state.model = {
            classes: [
                { name: 'A', baseClass: 'B' }, // Missing ID, baseClass by name
                { id: 'b', name: 'B', interfaces: ['I'] }, // ID present
                { id: 'i', name: 'I', isInterface: true }
            ]
        };
        utils.migrateModel();

        const a = state.model.classes.find(c => c.name === 'A');
        const b = state.model.classes.find(c => c.name === 'B');
        const i = state.model.classes.find(c => c.name === 'I');

        assert.ok(a.id, 'Class A should have an generated ID');
        assert.strictEqual(a.baseClassId, b.id, 'baseClass name should be migrated to baseClassId');
        assert.ok(Array.isArray(a.interfaces), 'interfaces should be initialized');
        assert.strictEqual(b.interfaces[0], i.id, 'interface name should be migrated to ID');
        assert.strictEqual(i.isInterface, true);
        assert.strictEqual(i.isAbstract, false, 'isAbstract should be default false');

        // 6. Test cleanupReferencesById
        console.log('Testing cleanupReferencesById...');
        // A inherits from B
        assert.strictEqual(a.baseClassId, b.id);

        // Delete B
        state.model.classes = state.model.classes.filter(c => c.id !== b.id);
        utils.cleanupReferencesById(b.id);

        assert.strictEqual(a.baseClassId, null, 'Reference to B should be cleared');

        console.log('All main.utils.js tests passed! ✅');
        process.exit(0);
    } catch (err) {
        console.error('Tests failed ❌');
        console.error(err);
        process.exit(1);
    }
})();
