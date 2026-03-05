import * as assert from 'assert';
import { DslIntegrator, DslContentEntry } from '../../view/lib/application/DslIntegrator';
import { ComponentDomainModel } from '../../view/lib/ComponentDomainModel';

/**
 * DslIntegrator テストスイート
 *
 * 複数 DSL ファイルの統合解析・クラス自動アサイン・依存関係導出を検証する。
 */
suite('DslIntegrator', () => {

    // ──────────────────────────────────────────────
    // Helper: ComponentDomainModel にコンポーネントを追加して dslPath を設定
    // ──────────────────────────────────────────────
    function addComponentWithDslPath(
        model: ComponentDomainModel,
        name: string,
        dslPath: string,
        kind: 'component' | 'subsystem' | 'application' = 'component'
    ): { model: ComponentDomainModel; componentId: string } {
        let m = model.addComponent(kind);
        const comps = m.getComponents();
        const added = comps[comps.length - 1];
        m = m.updateComponent({ ...added, name, dslPath });
        return { model: m, componentId: added.id };
    }

    // ──────────────────────────────────────────────
    // collectDslPaths
    // ──────────────────────────────────────────────

    test('collectDslPaths returns empty array for empty model', () => {
        const model = ComponentDomainModel.createEmpty();
        const paths = DslIntegrator.collectDslPaths(model);
        assert.deepStrictEqual(paths, []);
    });

    test('collectDslPaths returns unique dslPaths', () => {
        let model = ComponentDomainModel.createEmpty();
        const r1 = addComponentWithDslPath(model, 'CompA', 'path/a.dsl');
        model = r1.model;
        const r2 = addComponentWithDslPath(model, 'CompB', 'path/b.dsl');
        model = r2.model;
        const r3 = addComponentWithDslPath(model, 'CompC', 'path/a.dsl');  // duplicate
        model = r3.model;

        const paths = DslIntegrator.collectDslPaths(model);
        assert.strictEqual(paths.length, 2);
        assert.ok(paths.includes('path/a.dsl'));
        assert.ok(paths.includes('path/b.dsl'));
    });

    test('collectDslPaths skips components without dslPath', () => {
        let model = ComponentDomainModel.createEmpty();
        model = model.addComponent('component');
        const r = addComponentWithDslPath(model, 'CompA', 'path/a.dsl');
        model = r.model;

        const paths = DslIntegrator.collectDslPaths(model);
        assert.strictEqual(paths.length, 1);
        assert.strictEqual(paths[0], 'path/a.dsl');
    });

    // ──────────────────────────────────────────────
    // integrate - 基本
    // ──────────────────────────────────────────────

    test('integrate with empty dslContents returns empty result', () => {
        const model = ComponentDomainModel.createEmpty();
        const result = DslIntegrator.integrate(model, []);
        assert.strictEqual(result.derived.length, 0);
        assert.strictEqual(result.classNamesByDslPath.size, 0);
    });

    test('integrate parses single DSL and assigns classes to component', () => {
        let model = ComponentDomainModel.createEmpty();
        const r = addComponentWithDslPath(model, 'OrderComp', 'order.dsl');
        model = r.model;

        const dslContents: DslContentEntry[] = [
            {
                dslPath: 'order.dsl',
                content: [
                    'class Order',
                    '  -orderId: string',
                    '  +getTotal(): number',
                    '',
                    'class OrderItem',
                    '  -quantity: int',
                ].join('\n'),
            },
        ];

        const result = DslIntegrator.integrate(model, dslContents);

        // OrderComp にクラスがアサインされたことを確認
        const comp = result.componentDomain.getComponent(r.componentId);
        assert.ok(comp, 'Component should still exist');
        assert.strictEqual(comp!.classIds.length, 2, 'Should have 2 classes assigned');

        // classNamesByDslPath を確認
        const names = result.classNamesByDslPath.get('order.dsl');
        assert.ok(names);
        assert.ok(names!.includes('Order'));
        assert.ok(names!.includes('OrderItem'));
    });

    test('integrate with multiple DSLs assigns classes to correct components', () => {
        let model = ComponentDomainModel.createEmpty();
        const r1 = addComponentWithDslPath(model, 'OrderComp', 'order.dsl');
        model = r1.model;
        const r2 = addComponentWithDslPath(model, 'UserComp', 'user.dsl');
        model = r2.model;

        const dslContents: DslContentEntry[] = [
            {
                dslPath: 'order.dsl',
                content: 'class Order\n  -orderId: string\n',
            },
            {
                dslPath: 'user.dsl',
                content: 'class User\n  -name: string\n',
            },
        ];

        const result = DslIntegrator.integrate(model, dslContents);

        const orderComp = result.componentDomain.getComponent(r1.componentId);
        const userComp = result.componentDomain.getComponent(r2.componentId);
        assert.ok(orderComp);
        assert.ok(userComp);
        assert.strictEqual(orderComp!.classIds.length, 1);
        assert.strictEqual(userComp!.classIds.length, 1);
    });

    // ──────────────────────────────────────────────
    // integrate - クロスDSL依存検出
    // ──────────────────────────────────────────────

    test('integrate derives cross-component dependency from class references', () => {
        let model = ComponentDomainModel.createEmpty();
        const r1 = addComponentWithDslPath(model, 'OrderComp', 'order.dsl');
        model = r1.model;
        const r2 = addComponentWithDslPath(model, 'UserComp', 'user.dsl');
        model = r2.model;

        // Order has a member of type User → creates a cross-component dependency
        const dslContents: DslContentEntry[] = [
            {
                dslPath: 'order.dsl',
                content: [
                    'class Order',
                    '  -orderId: string',
                    '  -customer: User',
                ].join('\n'),
            },
            {
                dslPath: 'user.dsl',
                content: [
                    'class User',
                    '  -name: string',
                ].join('\n'),
            },
        ];

        const result = DslIntegrator.integrate(model, dslContents);

        // component間の依存関係が導出されていることを確認
        assert.ok(result.derived.length > 0, 'Should have derived at least one component relationship');

        // OrderComp → UserComp の依存があるはず
        const orderToUser = result.derived.find(r => {
            const src = result.componentDomain.getComponent(r.sourceComponentId);
            const tgt = result.componentDomain.getComponent(r.targetComponentId);
            return src?.name === 'OrderComp' && tgt?.name === 'UserComp';
        });
        assert.ok(orderToUser, 'Should have OrderComp → UserComp dependency');
    });

    test('integrate skips components without dslPath', () => {
        let model = ComponentDomainModel.createEmpty();
        // Component without dslPath
        model = model.addComponent('component');
        const r = addComponentWithDslPath(model, 'OrderComp', 'order.dsl');
        model = r.model;

        const dslContents: DslContentEntry[] = [
            {
                dslPath: 'order.dsl',
                content: 'class Order\n  -orderId: string\n',
            },
        ];

        const result = DslIntegrator.integrate(model, dslContents);

        const orderComp = result.componentDomain.getComponent(r.componentId);
        assert.ok(orderComp);
        assert.strictEqual(orderComp!.classIds.length, 1);
    });

    test('integrate clears previous class assignments (full-clear mode)', () => {
        let model = ComponentDomainModel.createEmpty();
        const r = addComponentWithDslPath(model, 'OrderComp', 'order.dsl');
        model = r.model;

        // First integration
        const result1 = DslIntegrator.integrate(model, [
            {
                dslPath: 'order.dsl',
                content: 'class Order\n  -orderId: string\n',
            },
        ]);

        // Second integration with different DSL content
        const result2 = DslIntegrator.integrate(result1.componentDomain, [
            {
                dslPath: 'order.dsl',
                content: 'class NewOrder\n  -newField: string\n',
            },
        ]);

        const comp = result2.componentDomain.getComponent(r.componentId);
        assert.ok(comp);
        // Should only have classes from the SECOND integration
        const classNames = result2.classNamesByDslPath.get('order.dsl');
        assert.ok(classNames);
        assert.ok(classNames!.includes('NewOrder'));
        assert.ok(!classNames!.includes('Order'), 'Old class should not be in new integration result');
    });
});
