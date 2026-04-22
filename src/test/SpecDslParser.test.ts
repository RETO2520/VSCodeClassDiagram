import * as assert from 'assert';
import { SpecDslParser } from '../../view/lib/SpecDslParser';
import { ClassDiagramService } from '../../view/lib/application/ClassDiagramService';
import { DomainModel } from '../../view/lib/DomainModel';

suite('SpecDslParser Flow DSL', () => {

    // ─────────────────────────────────────────────────────────────
    // Phase 1: 既存テスト
    // ─────────────────────────────────────────────────────────────

    test('parses Flow block into workflowAst and keeps gherkin workflow', () => {
        const dsl = [
            'class OrderService',
            '+ process(amount:number): boolean',
            'Scenario: approved flow',
            'Given order is pending',
            'When payment is valid',
            'Then order is completed',
            'Flow:',
            'var normalized:boolean = amount > 0',
            'if normalized',
            '  do this.markCompleted()',
            '  return true',
            'else',
            '  do this.markRejected()',
            '  return false',
            'end',
        ].join('\n');

        const service = new ClassDiagramService(DomainModel.createEmpty());
        new SpecDslParser().parse(dsl, service);

        const op = service.getOperationByName('OrderService', 'process');
        assert.ok(op, 'operation should exist');
        assert.ok(op!.workflow && op!.workflow.nodes.length >= 3, 'gherkin workflow should be populated');
        assert.ok(op!.workflowAst, 'workflowAst should be populated');

        const ast = op!.workflowAst!;
        assert.strictEqual(ast.variables.length, 1);
        assert.strictEqual(ast.variables[0].name, 'normalized');
        assert.strictEqual(ast.variables[0].type, 'boolean');

        const ifNode = (ast.body as any[]).find(n => n.type === 'if');
        assert.ok(ifNode, 'if node should exist in AST');
        assert.strictEqual(ifNode.condition, 'normalized');
        assert.strictEqual(ifNode.then[0].type, 'action');
        assert.strictEqual(ifNode.then[1].type, 'return');
        assert.strictEqual(ifNode.else[0].type, 'action');
        assert.strictEqual(ifNode.else[1].type, 'return');
    });

    test('parses while/return nodes from Flow block', () => {
        const dsl = [
            'class BatchService',
            '+ run(): void',
            'Scenario: loop scenario',
            'Given queue exists',
            'When run starts',
            'Then queue is consumed',
            'Flow:',
            'while hasNext()',
            '  do this.consumeNext()',
            'end',
            'return',
        ].join('\n');

        const service = new ClassDiagramService(DomainModel.createEmpty());
        new SpecDslParser().parse(dsl, service);

        const op = service.getOperationByName('BatchService', 'run');
        assert.ok(op?.workflowAst);

        const ast = op!.workflowAst!;
        const whileNode = (ast.body as any[]).find(n => n.type === 'while');
        assert.ok(whileNode, 'while node should exist');
        assert.strictEqual(whileNode.condition, 'hasNext()');
        assert.strictEqual(whileNode.body[0].type, 'action');

        const returnNode = (ast.body as any[]).find(n => n.type === 'return');
        assert.ok(returnNode, 'return node should exist');
    });

    // ─────────────────────────────────────────────────────────────
    // Phase 2: Gherkin と Flow は独立したグラフ
    // ─────────────────────────────────────────────────────────────

    test('[独立性] workflow は Gherkin ノードのみを含み Flow ノードを含まない', () => {
        const dsl = [
            'class PaymentService',
            '+ approve(amount:number): boolean',
            'Scenario: approval',
            'Given amount is positive',
            'When approve is called',
            'Then result is returned',
            'Flow:',
            'if amount > 0',
            '  do this.markApproved()',
            '  return true',
            'else',
            '  do this.markRejected()',
            '  return false',
            'end',
        ].join('\n');

        const service = new ClassDiagramService(DomainModel.createEmpty());
        new SpecDslParser().parse(dsl, service);

        const op = service.getOperationByName('PaymentService', 'approve');
        assert.ok(op?.workflow, 'workflow should exist');
        assert.ok(op?.workflowAst, 'workflowAst should exist');

        const workflowTypes = op!.workflow!.nodes.map(n => n.type);

        // workflow に Flow 由来のノード型が含まれないこと
        const flowOnlyTypes = ['decision', 'loop', 'foreach', 'forrange', 'switch', 'break', 'continue'];
        for (const t of flowOnlyTypes) {
            assert.ok(!workflowTypes.includes(t), `workflow should NOT contain node type "${t}"`);
        }

        // workflow には Gherkin 由来のノード型のみ含まれること
        const allowedTypes = ['start', 'end', 'given', 'when', 'then', 'process'];
        for (const t of workflowTypes) {
            assert.ok(allowedTypes.includes(t), `workflow node type "${t}" is not a Gherkin type`);
        }
    });

    test('[独立性] workflowAst は Gherkin グラフとは別個に存在し、構造が正しい', () => {
        const dsl = [
            'class PaymentService',
            '+ approve(amount:number): boolean',
            'Scenario: approval',
            'Given amount is positive',
            'When approve is called',
            'Then result is returned',
            'Flow:',
            'if amount > 0',
            '  do this.markApproved()',
            '  return true',
            'else',
            '  do this.markRejected()',
            '  return false',
            'end',
        ].join('\n');

        const service = new ClassDiagramService(DomainModel.createEmpty());
        new SpecDslParser().parse(dsl, service);

        const op = service.getOperationByName('PaymentService', 'approve');
        const ast = op!.workflowAst!;

        // workflowAst に if/else 構造が正しく格納されている
        const ifNode = (ast.body as any[]).find(n => n.type === 'if');
        assert.ok(ifNode, 'if node should exist in workflowAst');
        assert.strictEqual(ifNode.condition, 'amount > 0');
        assert.strictEqual(ifNode.then[0].type, 'action');
        assert.strictEqual(ifNode.then[1].type, 'return');
        assert.ok(ifNode.else, 'else branch should exist');

        // workflow の Gherkin ノードと workflowAst のノードは ID が共有されない
        const workflowNodeIds = new Set(op!.workflow!.nodes.map(n => n.id));
        const collectAstIds = (nodes: any[]): string[] => {
            // workflowAst のノードは id を持たない（AST構造）ので、
            // ここでは「workflowAst に workflow のノードIDが混入していない」ことを確認する代わりに
            // workflow ノード数と AST body 長が独立していることを確認する
            return nodes.map(n => n.type);
        };
        // workflow は Gherkin 4ノード (start + given + when + then + end = 5) を持つ
        assert.ok(op!.workflow!.nodes.length >= 4, 'workflow should have Gherkin nodes');
        // workflowAst.body には Gherkin 由来の action が含まれない
        const astBodyTypes = (ast.body as any[]).map(n => n.type);
        assert.ok(!astBodyTypes.includes('given'), 'workflowAst should not contain "given" type');
        assert.ok(!astBodyTypes.includes('when'), 'workflowAst should not contain "when" type');
        assert.ok(!astBodyTypes.includes('then'), 'workflowAst should not contain "then" type');
    });

    // ─────────────────────────────────────────────────────────────
    // Phase 2: forEach / forRange / switch / break / continue の AST
    // ─────────────────────────────────────────────────────────────

    test('[Phase2 AST] for...in が forEach ノードに変換される', () => {
        const dsl = [
            'class OrderProcessor',
            '+ processAll(): void',
            'Scenario: process all orders',
            'Given orders exist',
            'When processAll is called',
            'Then each order is processed',
            'Flow:',
            'for order in this.orders',
            '  do order.process()',
            'end',
        ].join('\n');

        const service = new ClassDiagramService(DomainModel.createEmpty());
        new SpecDslParser().parse(dsl, service);

        const op = service.getOperationByName('OrderProcessor', 'processAll');
        assert.ok(op?.workflowAst);

        const ast = op!.workflowAst!;
        const forEachAst = (ast.body as any[]).find(n => n.type === 'forEach');
        assert.ok(forEachAst, 'forEach AST node should exist');
        assert.strictEqual(forEachAst.variable, 'order');
        assert.strictEqual(forEachAst.collection, 'this.orders');
        assert.strictEqual(forEachAst.body[0].type, 'action');

        // Gherkin グラフに foreach ノードが含まれないこと
        const workflowTypes = op!.workflow!.nodes.map(n => n.type);
        assert.ok(!workflowTypes.includes('foreach'), 'workflow should NOT contain foreach node');
    });

    test('[Phase2 AST] for...from...to が forRange ノードに変換される', () => {
        const dsl = [
            'class Counter',
            '+ countUp(): void',
            'Scenario: count',
            'Given counter is ready',
            'When countUp is called',
            'Then counter increments',
            'Flow:',
            'for i from 0 to 10',
            '  do this.increment(i)',
            'end',
        ].join('\n');

        const service = new ClassDiagramService(DomainModel.createEmpty());
        new SpecDslParser().parse(dsl, service);

        const op = service.getOperationByName('Counter', 'countUp');
        const ast = op!.workflowAst!;

        const forRangeAst = (ast.body as any[]).find(n => n.type === 'forRange');
        assert.ok(forRangeAst, 'forRange AST node should exist');
        assert.strictEqual(forRangeAst.variable, 'i');
        assert.strictEqual(forRangeAst.from, '0');
        assert.strictEqual(forRangeAst.to, '10');

        const workflowTypes = op!.workflow!.nodes.map(n => n.type);
        assert.ok(!workflowTypes.includes('forrange'), 'workflow should NOT contain forrange node');
    });

    test('[Phase2 AST] switch が switch/case/default ノードに変換される', () => {
        const dsl = [
            'class StatusHandler',
            '+ handle(): void',
            'Scenario: handle status',
            'Given status is set',
            'When handle is called',
            'Then action is taken',
            'Flow:',
            'switch this.status',
            '  case "pending":',
            '    do this.initialize()',
            '  case "active":',
            '    do this.execute()',
            '  default:',
            '    do this.skip()',
            'end',
        ].join('\n');

        const service = new ClassDiagramService(DomainModel.createEmpty());
        new SpecDslParser().parse(dsl, service);

        const op = service.getOperationByName('StatusHandler', 'handle');
        const ast = op!.workflowAst!;

        const switchAst = (ast.body as any[]).find(n => n.type === 'switch');
        assert.ok(switchAst, 'switch AST node should exist');
        assert.strictEqual(switchAst.expression, 'this.status');
        assert.strictEqual(switchAst.cases.length, 2);
        assert.strictEqual(switchAst.cases[0].value, '"pending"');
        assert.strictEqual(switchAst.cases[1].value, '"active"');
        assert.ok(switchAst.default?.length >= 1, 'default branch should exist');

        const workflowTypes = op!.workflow!.nodes.map(n => n.type);
        assert.ok(!workflowTypes.includes('switch'), 'workflow should NOT contain switch node');
    });

    test('[Phase2 AST] break と continue が AST に格納される', () => {
        const dsl = [
            'class Searcher',
            '+ findFirst(): void',
            'Scenario: find first match',
            'Given items exist',
            'When findFirst is called',
            'Then first match is returned',
            'Flow:',
            'for item in this.items',
            '  if item.matches()',
            '    do this.setResult(item)',
            '    break',
            '  end',
            '  continue',
            'end',
        ].join('\n');

        const service = new ClassDiagramService(DomainModel.createEmpty());
        new SpecDslParser().parse(dsl, service);

        const op = service.getOperationByName('Searcher', 'findFirst');
        const ast = op!.workflowAst!;

        const forEachAst = (ast.body as any[]).find(n => n.type === 'forEach');
        assert.ok(forEachAst, 'forEach should exist');

        const ifInLoop = forEachAst.body.find((n: any) => n.type === 'if');
        assert.ok(ifInLoop, 'if inside forEach should exist');

        const breakNode = ifInLoop.then.find((n: any) => n.type === 'break');
        assert.ok(breakNode, 'break node should exist in AST');

        const continueNode = forEachAst.body.find((n: any) => n.type === 'continue');
        assert.ok(continueNode, 'continue node should exist in AST');

        // Gherkin グラフに break/continue ノードが含まれないこと
        const workflowTypes = op!.workflow!.nodes.map(n => n.type);
        assert.ok(!workflowTypes.includes('break'), 'workflow should NOT contain break node');
        assert.ok(!workflowTypes.includes('continue'), 'workflow should NOT contain continue node');
    });
});
