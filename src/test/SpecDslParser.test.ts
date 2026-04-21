import * as assert from 'assert';
import { SpecDslParser } from '../../view/lib/SpecDslParser';
import { ClassDiagramService } from '../../view/lib/application/ClassDiagramService';
import { DomainModel } from '../../view/lib/DomainModel';

suite('SpecDslParser Flow DSL', () => {

    // ─────────────────────────────────────────────────────────────
    // 既存テスト (Phase 1)
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
        const parser = new SpecDslParser();
        parser.parse(dsl, service);

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
        const parser = new SpecDslParser();
        parser.parse(dsl, service);

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
    // Phase 2 テスト: Flow → ワークフロー図グラフへの反映
    // ─────────────────────────────────────────────────────────────

    test('[Phase2] Flow if/else reflects visual decision node in workflow.nodes', () => {
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

        const nodes = op!.workflow!.nodes;
        const decisionNodes = nodes.filter(n => n.type === 'decision');
        assert.ok(decisionNodes.length >= 1, 'at least one decision node should be generated from if');
        assert.strictEqual(decisionNodes[0].label, 'amount > 0');

        // true/false エッジの存在確認
        const edges = op!.workflow!.edges;
        const decId = decisionNodes[0].id;
        const trueEdge = edges.find(e => e.from === decId && e.condition === 'true');
        const falseEdge = edges.find(e => e.from === decId && e.condition === 'false');
        assert.ok(trueEdge, 'true edge should exist');
        assert.ok(falseEdge, 'false edge should exist');
    });

    test('[Phase2] Flow while reflects loop node in workflow.nodes', () => {
        const dsl = [
            'class QueueProcessor',
            '+ drain(): void',
            'Scenario: drain queue',
            'Given queue has items',
            'When drain is called',
            'Then items are processed',
            'Flow:',
            'while queue.hasNext()',
            '  do queue.processNext()',
            'end',
        ].join('\n');

        const service = new ClassDiagramService(DomainModel.createEmpty());
        new SpecDslParser().parse(dsl, service);

        const op = service.getOperationByName('QueueProcessor', 'drain');
        assert.ok(op?.workflow);

        const nodes = op!.workflow!.nodes;
        const loopNodes = nodes.filter(n => n.type === 'loop');
        assert.ok(loopNodes.length >= 1, 'loop node should exist');
        assert.strictEqual(loopNodes[0].label, 'queue.hasNext()');

        const edges = op!.workflow!.edges;
        const loopId = loopNodes[0].id;
        assert.ok(edges.find(e => e.from === loopId && e.condition === 'true'), 'true(body) edge should exist');
        assert.ok(edges.find(e => e.from === loopId && e.condition === 'false'), 'false(exit) edge should exist');
    });

    test('[Phase2] Flow forEach reflects foreach node in workflow.nodes', () => {
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
        assert.ok(op?.workflow);

        // AST
        const ast = op!.workflowAst!;
        const forEachAst = (ast.body as any[]).find(n => n.type === 'forEach');
        assert.ok(forEachAst, 'forEach AST node should exist');
        assert.strictEqual(forEachAst.variable, 'order');
        assert.strictEqual(forEachAst.collection, 'this.orders');
        assert.strictEqual(forEachAst.body[0].type, 'action');

        // ビジュアルグラフ
        const nodes = op!.workflow!.nodes;
        const forNode = nodes.find(n => n.type === 'foreach');
        assert.ok(forNode, 'foreach visual node should exist');
        assert.ok(forNode!.label.includes('order') && forNode!.label.includes('this.orders'));

        const edges = op!.workflow!.edges;
        assert.ok(edges.find(e => e.from === forNode!.id && e.condition === 'body'), 'body edge should exist');
    });

    test('[Phase2] Flow forRange reflects forrange node in workflow.nodes', () => {
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
        assert.ok(op?.workflow);

        const ast = op!.workflowAst!;
        const forRangeAst = (ast.body as any[]).find(n => n.type === 'forRange');
        assert.ok(forRangeAst, 'forRange AST node should exist');
        assert.strictEqual(forRangeAst.variable, 'i');
        assert.strictEqual(forRangeAst.from, '0');
        assert.strictEqual(forRangeAst.to, '10');

        const nodes = op!.workflow!.nodes;
        const forNode = nodes.find(n => n.type === 'forrange');
        assert.ok(forNode, 'forrange visual node should exist');
        assert.ok(forNode!.label.includes('from 0 to 10'));
    });

    test('[Phase2] Flow switch reflects switch node with case edges in workflow', () => {
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
        assert.ok(op?.workflow);

        // AST
        const ast = op!.workflowAst!;
        const switchAst = (ast.body as any[]).find(n => n.type === 'switch');
        assert.ok(switchAst, 'switch AST node should exist');
        assert.strictEqual(switchAst.expression, 'this.status');
        assert.strictEqual(switchAst.cases.length, 2);
        assert.strictEqual(switchAst.cases[0].value, '"pending"');
        assert.strictEqual(switchAst.cases[1].value, '"active"');
        assert.ok(switchAst.default?.length >= 1, 'default branch should exist');

        // ビジュアルグラフ
        const nodes = op!.workflow!.nodes;
        const switchNode = nodes.find(n => n.type === 'switch');
        assert.ok(switchNode, 'switch visual node should exist');
        assert.strictEqual(switchNode!.label, 'this.status');

        const edges = op!.workflow!.edges;
        assert.ok(edges.find(e => e.from === switchNode!.id && e.condition === 'case0'), 'case0 edge should exist');
        assert.ok(edges.find(e => e.from === switchNode!.id && e.condition === 'case1'), 'case1 edge should exist');
        assert.ok(edges.find(e => e.from === switchNode!.id && e.condition === 'default'), 'default edge should exist');
    });

    test('[Phase2] Flow break/continue reflect in AST and workflow nodes', () => {
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
        assert.ok(op?.workflowAst);

        const ast = op!.workflowAst!;
        const forEachAst = (ast.body as any[]).find(n => n.type === 'forEach');
        assert.ok(forEachAst, 'forEach should exist');

        const ifInLoop = forEachAst.body.find((n: any) => n.type === 'if');
        assert.ok(ifInLoop, 'if inside forEach should exist');

        const breakNode = ifInLoop.then.find((n: any) => n.type === 'break');
        assert.ok(breakNode, 'break node should exist in AST');

        const continueNode = forEachAst.body.find((n: any) => n.type === 'continue');
        assert.ok(continueNode, 'continue node should exist in AST');

        // ビジュアルグラフ内の break / continue ノード確認
        const nodes = op!.workflow!.nodes;
        assert.ok(nodes.find(n => n.type === 'break'), 'break visual node should exist');
        assert.ok(nodes.find(n => n.type === 'continue'), 'continue visual node should exist');
    });

    test('[Phase2] Flow graph connects to Gherkin last node', () => {
        const dsl = [
            'class Validator',
            '+ validate(value:number): boolean',
            'Scenario: valid input',
            'Given value is provided',
            'When validate is called',
            'Then result is valid',
            'Flow:',
            'if value > 0',
            '  return true',
            'else',
            '  return false',
            'end',
        ].join('\n');

        const service = new ClassDiagramService(DomainModel.createEmpty());
        new SpecDslParser().parse(dsl, service);

        const op = service.getOperationByName('Validator', 'validate');
        assert.ok(op?.workflow);

        const nodes = op!.workflow!.nodes;
        const edges = op!.workflow!.edges;

        // Then ノードが存在する
        const thenNode = nodes.find(n => n.label.startsWith('Then:'));
        assert.ok(thenNode, 'Then gherkin node should exist');

        // Then ノードの後に decision ノードが接続されている
        const decisionNode = nodes.find(n => n.type === 'decision');
        assert.ok(decisionNode, 'decision node from Flow should exist');

        const connectingEdge = edges.find(e => e.from === thenNode!.id && e.to === decisionNode!.id);
        assert.ok(connectingEdge, 'Then node should connect to Flow decision node');
    });
});
