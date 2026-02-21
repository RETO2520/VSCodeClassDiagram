import { executeAction, parseCommand } from '../../view/lib/command-executor';
import * as assert from 'assert';
import { DomainModel } from '../../view/lib/DomainModel';

suite('Generation Responsibility and Factory Migration', () => {
    test('RelationCommand (+>) should add a create[Target] method', () => {
        let model = DomainModel.createEmpty();

        // Add two classes
        model = executeAction(parseCommand('c Caller')!, model).model;
        model = executeAction(parseCommand('c Target')!, model).model;

        // Execute +> relationship
        const command = parseCommand('Caller +> Target')!;
        const result = executeAction(command, model);

        const caller = result.model.findClassByName('Caller');
        const createMethod = caller?.operations.find(op => op.name === 'createTarget');

        assert.ok(createMethod, 'createTarget method should be added');
        assert.strictEqual(createMethod?.returnType, 'Target');
        assert.strictEqual(createMethod?.visibility, 'public');
    });

    test('ApplyFactoryPattern should migrate existing generation methods', () => {
        const fs = require('fs');
        const logFile = 'e:/Project/VSCodeExtensions/VSCodeClassDiagram/test_debug.log';
        function log(msg: string) {
            fs.appendFileSync(logFile, msg + '\n');
            console.log(msg);
        }

        try {
            fs.writeFileSync(logFile, 'Starting ApplyFactoryPattern test\n');
            let model = DomainModel.createEmpty();

            // Setup: Caller +> Concrete1, Caller +> Concrete2
            model = executeAction(parseCommand('c Caller')!, model).model;
            model = executeAction(parseCommand('c Concrete1')!, model).model;
            model = executeAction(parseCommand('c Concrete2')!, model).model;

            // Add instantiation relationships
            let res1 = executeAction(parseCommand('Caller +> Concrete1')!, model);
            model = res1.model;

            let res2 = executeAction(parseCommand('Caller +> Concrete2')!, model);
            model = res2.model;

            log('Setup complete');

            // Verify methods exist before migration
            const callerBefore = model.findClassByName('Caller');
            if (!callerBefore?.operations.find(op => op.name === 'createConcrete1')) throw new Error('Setup failed: createConcrete1 missing');
            if (!callerBefore?.operations.find(op => op.name === 'createConcrete2')) throw new Error('Setup failed: createConcrete2 missing');

            // Apply Factory Pattern
            log('Applying factory pattern');
            const factoryCmd = parseCommand('apply-factory MyFactory IProduct Concrete1 Concrete2')!;
            if (!factoryCmd) throw new Error('parseCommand returned null for apply-factory');
            const finalResult = executeAction(factoryCmd, model);
            log('Factory pattern applied successfully');

            // console.log('Available classes after migration:', finalResult.model.getClasses().map(c => c.name).join(', '));
            const callerAfter = finalResult.model.findClassByName('Caller');
            // if (callerAfter) {
            //     console.log('Caller operations:', callerAfter.operations.map(o => o.name).join(', '));
            // } else {
            //     console.log('FAIL: Caller class missing!');
            // }
            const factory = finalResult.model.findClassByName('MyFactory');

            // Verify methods are removed from Caller
            const op1 = callerAfter?.operations.find(op => op.name === 'createConcrete1');
            const op2 = callerAfter?.operations.find(op => op.name === 'createConcrete2');

            log(`Ops after: ${callerAfter?.operations.map(o => o.name).join(', ')}`);

            if (op1 || op2) {
                // console.log('FAIL: Caller still has operations:', callerAfter?.operations.map(o => o.name).join(', '));
            }

            assert.strictEqual(op1, undefined, 'createConcrete1 should be removed');
            assert.strictEqual(op2, undefined, 'createConcrete2 should be removed');

            // Verify Factory has the create method
            const factoryCreate = factory?.operations.find(op => op.name === 'create');
            assert.ok(factoryCreate, 'Factory should have create method');
            assert.strictEqual(factoryCreate?.returnType, 'IProduct');
            log('Test finished successfully');
        } catch (e: any) {
            log('TEST ERROR: ' + e.message);
            if (e.stack) log(e.stack);
            throw e;
        }
    });

    test('ApplyFactoryPattern should migrate methods even if caller is the abstract interface (Shape scenario)', () => {
        let model = DomainModel.createEmpty();

        // Setup: Shape +> Circle, Shape +> Square
        model = executeAction(parseCommand('c Shape')!, model).model;
        model = executeAction(parseCommand('c Circle')!, model).model;
        model = executeAction(parseCommand('c Square')!, model).model;

        // Add instantiation relationships
        let res1 = executeAction(parseCommand('Shape +> Circle')!, model);
        model = res1.model;

        let res2 = executeAction(parseCommand('Shape +> Square')!, model);
        model = res2.model;

        // Verify methods exist before migration
        const shapeBefore = model.findClassByName('Shape');
        assert.ok(shapeBefore?.operations.find(op => op.name === 'createCircle'), 'createCircle missing');
        assert.ok(shapeBefore?.operations.find(op => op.name === 'createSquare'), 'createSquare missing');

        // Apply Factory Pattern: ShapeFactory as factory, Shape as abstract, Circle/Square as concrete
        const factoryCmd = parseCommand('apply-factory ShapeFactory Shape Circle Square')!;
        const finalResult = executeAction(factoryCmd, model);

        const shapeAfter = finalResult.model.findClassByName('Shape');
        const op1 = shapeAfter?.operations.find(op => op.name === 'createCircle');
        const op2 = shapeAfter?.operations.find(op => op.name === 'createSquare');

        assert.strictEqual(op1, undefined, 'createCircle should be removed from Shape');
        assert.strictEqual(op2, undefined, 'createSquare should be removed from Shape');
        assert.strictEqual(shapeAfter?.kind, 'interface', 'Shape should be an interface now');

        const factory = finalResult.model.findClassByName('ShapeFactory');
        assert.ok(factory?.operations.find(op => op.name === 'create'), 'ShapeFactory should have create method');
    });
});
