import * as assert from 'assert';
import { ComponentService } from '../../view/lib/application/ComponentService';
import { ComponentDomainModel } from '../../view/lib/ComponentDomainModel';
import type { ComponentKind } from '../../view/lib/component-diagram-types';

suite('ComponentService folder-sync', () => {
    test('buildFromDiagramFiles returns empty model when no directories', () => {
        const model = ComponentService.buildFromDiagramFiles([]);
        assert.strictEqual(model.getComponents().length, 0);
        assert.strictEqual(model.getRelationships().length, 0);
    });

    test('single application folder produces one application component', () => {
        const files = [{ path: 'MyApp_Application', isDirectory: true }];
        const model = ComponentService.buildFromDiagramFiles(files);
        const comps = model.getComponents();
        assert.strictEqual(comps.length, 1);
        assert.strictEqual(comps[0].kind, 'application');
        assert.strictEqual(comps[0].name, 'MyApp');
    });

    test('subsystem under application produces hierarchy', () => {
        const files = [
            { path: 'MyApp_Application', isDirectory: true },
            { path: 'MyApp_Application/Orders_Subsystem', isDirectory: true },
        ];
        const model = ComponentService.buildFromDiagramFiles(files);
        const comps = model.getComponents();
        assert.strictEqual(comps.length, 2);
        const app = comps.find(c => c.kind === 'application');
        const subs = comps.find(c => c.kind === 'subsystem');
        assert.ok(app && subs);
        // ensure relationship
        const parents = model.getParentsOf(subs!.id);
        assert.strictEqual(parents.length, 1);
        assert.strictEqual(parents[0].id, app!.id);
    });

    test('component folder nested under subsystem creates component node', () => {
        const files = [
            { path: 'MyApp_Application', isDirectory: true },
            { path: 'MyApp_Application/Orders_Subsystem', isDirectory: true },
            { path: 'MyApp_Application/Orders_Subsystem/Cart_Component', isDirectory: true },
        ];
        const model = ComponentService.buildFromDiagramFiles(files);
        const comps = model.getComponents();
        assert.strictEqual(comps.length, 3);

        const app = comps.find(c => c.kind === 'application');
        const subs = comps.find(c => c.kind === 'subsystem');
        const comp = comps.find(c => c.kind === 'component');
        assert.ok(app && subs && comp);

        // check hierarchy chain
        const parentOfSubs = model.getParentsOf(subs!.id);
        assert.strictEqual(parentOfSubs.length, 1);
        assert.strictEqual(parentOfSubs[0].id, app!.id);

        const parentOfComp = model.getParentsOf(comp!.id);
        assert.strictEqual(parentOfComp.length, 1);
        assert.strictEqual(parentOfComp[0].id, subs!.id);
    });

    test('syncFromDiagramFiles mutates existing service', () => {
        const service = ComponentService.create(new (ComponentDomainModel as any)(), ComponentDomainModel.createEmpty());
        // start with some bogus component so we can detect replacement
        service.syncFromDiagramFiles([{ path: 'A_Application', isDirectory: true }]);
        const comps = service['componentDomain'].getComponents();
        assert.strictEqual(comps.length, 1);
        assert.strictEqual(comps[0].name, 'A');

        // sync again with different structure
        service.syncFromDiagramFiles([{
            path: 'B_Application/One_Subsystem', isDirectory: true
        }]);
        const comps2 = service['componentDomain'].getComponents();
        assert.strictEqual(comps2.length, 2);
        const kinds = comps2.map(c => c.kind).sort();
        assert.deepStrictEqual(kinds, ['application', 'subsystem']);
    });
});
