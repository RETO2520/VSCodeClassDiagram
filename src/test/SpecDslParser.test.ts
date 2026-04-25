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
            'class OrderService', '+ process(amount:number): boolean',
            'Scenario: approved flow',
            'Given order is pending', 'When payment is valid', 'Then order is completed',
            'Flow:', 'var normalized:boolean = amount > 0',
            'if normalized', '  do this.markCompleted()', '  return true',
            'else', '  do this.markRejected()', '  return false', 'end',
        ].join('\n');
        const service = new ClassDiagramService(DomainModel.createEmpty());
        new SpecDslParser().parse(dsl, service);
        const op = service.getOperationByName('OrderService', 'process');
        assert.ok(op); assert.ok(op!.workflow && op!.workflow.nodes.length >= 3);
        assert.ok(op!.workflowAst);
        const ast = op!.workflowAst!;
        assert.strictEqual(ast.variables.length, 1);
        assert.strictEqual(ast.variables[0].name, 'normalized');
        const ifNode = (ast.body as any[]).find(n => n.type === 'if');
        assert.ok(ifNode); assert.strictEqual(ifNode.condition, 'normalized');
        assert.strictEqual(ifNode.then[0].type, 'action');
        assert.strictEqual(ifNode.then[1].type, 'return');
        assert.strictEqual(ifNode.else[0].type, 'action');
        assert.strictEqual(ifNode.else[1].type, 'return');
    });

    test('parses while/return nodes from Flow block', () => {
        const dsl = [
            'class BatchService', '+ run(): void',
            'Scenario: loop scenario', 'Given queue exists', 'When run starts', 'Then queue is consumed',
            'Flow:', 'while hasNext()', '  do this.consumeNext()', 'end', 'return',
        ].join('\n');
        const service = new ClassDiagramService(DomainModel.createEmpty());
        new SpecDslParser().parse(dsl, service);
        const op = service.getOperationByName('BatchService', 'run');
        assert.ok(op?.workflowAst);
        const ast = op!.workflowAst!;
        const whileNode = (ast.body as any[]).find(n => n.type === 'while');
        assert.ok(whileNode); assert.strictEqual(whileNode.condition, 'hasNext()');
        assert.strictEqual(whileNode.body[0].type, 'action');
        assert.ok((ast.body as any[]).find(n => n.type === 'return'));
    });

    // ─────────────────────────────────────────────────────────────
    // 独立性テスト
    // ─────────────────────────────────────────────────────────────

    test('[独立性] workflow は Gherkin ノードのみを含み Flow ノードを含まない', () => {
        const dsl = [
            'class PaymentService', '+ approve(amount:number): boolean',
            'Scenario: approval', 'Given amount is positive', 'When approve is called', 'Then result is returned',
            'Flow:', 'if amount > 0', '  do this.markApproved()', '  return true',
            'else', '  do this.markRejected()', '  return false', 'end',
        ].join('\n');
        const service = new ClassDiagramService(DomainModel.createEmpty());
        new SpecDslParser().parse(dsl, service);
        const op = service.getOperationByName('PaymentService', 'approve');
        assert.ok(op?.workflow); assert.ok(op?.workflowAst);
        const workflowTypes = op!.workflow!.nodes.map(n => n.type);
        for (const t of ['decision', 'loop', 'foreach', 'forrange', 'switch', 'break', 'continue']) {
            assert.ok(!workflowTypes.includes(t), `workflow should NOT contain "${t}"`);
        }
    });

    // ─────────────────────────────────────────────────────────────
    // Phase 2: switch — 複数 case のバグ修正テスト
    // ─────────────────────────────────────────────────────────────

    test('[switch bugfix] 2番目以降の case が前の case ボディに流れ込まない', () => {
        const dsl = [
            'class StatusHandler', '+ handle(): void',
            'Scenario: handle status', 'Given status is set', 'When handle is called', 'Then action is taken',
            'Flow:',
            'switch this.status',
            '  case "pending":',
            '    do this.initialize()',
            '  case "active":',
            '    do this.execute()',
            '  case "closed":',
            '    do this.archive()',
            '  default:',
            '    do this.skip()',
            'end',
        ].join('\n');

        const service = new ClassDiagramService(DomainModel.createEmpty());
        new SpecDslParser().parse(dsl, service);
        const op = service.getOperationByName('StatusHandler', 'handle');
        assert.ok(op?.workflowAst, 'workflowAst should exist');

        const ast = op!.workflowAst!;
        const switchAst = (ast.body as any[]).find(n => n.type === 'switch');
        assert.ok(switchAst, 'switch node should exist');
        assert.strictEqual(switchAst.expression, 'this.status');

        // cases は 3 件
        assert.strictEqual(switchAst.cases.length, 3, 'should have 3 cases');

        // 各 case の value が正しい
        assert.strictEqual(switchAst.cases[0].value, '"pending"');
        assert.strictEqual(switchAst.cases[1].value, '"active"');
        assert.strictEqual(switchAst.cases[2].value, '"closed"');

        // 各 case のボディが独立している（他の case のノードが混入していない）
        assert.strictEqual(switchAst.cases[0].body.length, 1, 'case[0] body should have 1 node');
        assert.strictEqual(switchAst.cases[0].body[0].statement, 'this.initialize()');

        assert.strictEqual(switchAst.cases[1].body.length, 1, 'case[1] body should have 1 node (not contaminated by case[0])');
        assert.strictEqual(switchAst.cases[1].body[0].statement, 'this.execute()');

        assert.strictEqual(switchAst.cases[2].body.length, 1, 'case[2] body should have 1 node');
        assert.strictEqual(switchAst.cases[2].body[0].statement, 'this.archive()');

        // default が存在する
        assert.ok(Array.isArray(switchAst.default) && switchAst.default.length === 1, 'default should have 1 node');
        assert.strictEqual(switchAst.default[0].statement, 'this.skip()');
    });

    test('[switch bugfix] case ボディに複数ステートメントがあっても正しく分離される', () => {
        const dsl = [
            'class Router', '+ route(): void',
            'Scenario: routing', 'Given request received', 'When route is called', 'Then response sent',
            'Flow:',
            'switch this.method',
            '  case "GET":',
            '    do this.validateQuery()',
            '    do this.fetchData()',
            '    return this.renderJson()',
            '  case "POST":',
            '    do this.validateBody()',
            '    do this.saveData()',
            '    return this.renderCreated()',
            '  default:',
            '    return this.renderNotAllowed()',
            'end',
        ].join('\n');

        const service = new ClassDiagramService(DomainModel.createEmpty());
        new SpecDslParser().parse(dsl, service);
        const op = service.getOperationByName('Router', 'route');
        const ast = op!.workflowAst!;
        const sw = (ast.body as any[]).find(n => n.type === 'switch');

        assert.strictEqual(sw.cases.length, 2);

        // GET case: 3ノード (action, action, return)
        assert.strictEqual(sw.cases[0].value, '"GET"');
        assert.strictEqual(sw.cases[0].body.length, 3, 'GET case should have 3 nodes');
        assert.strictEqual(sw.cases[0].body[0].statement, 'this.validateQuery()');
        assert.strictEqual(sw.cases[0].body[1].statement, 'this.fetchData()');
        assert.strictEqual(sw.cases[0].body[2].type, 'return');

        // POST case: 3ノード — GET の内容が混入していないこと
        assert.strictEqual(sw.cases[1].value, '"POST"');
        assert.strictEqual(sw.cases[1].body.length, 3, 'POST case should have 3 nodes (not contaminated by GET)');
        assert.strictEqual(sw.cases[1].body[0].statement, 'this.validateBody()');

        // default: 1ノード
        assert.strictEqual(sw.default.length, 1);
        assert.strictEqual(sw.default[0].type, 'return');
    });

    // ─────────────────────────────────────────────────────────────
    // Phase 2: forEach / forRange / break / continue
    // ─────────────────────────────────────────────────────────────

    test('[Phase2 AST] for...in が forEach ノードに変換される', () => {
        const dsl = [
            'class OrderProcessor', '+ processAll(): void',
            'Scenario: process all', 'Given orders exist', 'When processAll is called', 'Then each processed',
            'Flow:', 'for order in this.orders', '  do order.process()', 'end',
        ].join('\n');
        const service = new ClassDiagramService(DomainModel.createEmpty());
        new SpecDslParser().parse(dsl, service);
        const ast = service.getOperationByName('OrderProcessor', 'processAll')!.workflowAst!;
        const n = (ast.body as any[]).find(n => n.type === 'forEach');
        assert.ok(n); assert.strictEqual(n.variable, 'order'); assert.strictEqual(n.collection, 'this.orders');
        assert.strictEqual(n.body[0].type, 'action');
    });

    test('[Phase2 AST] for...from...to が forRange ノードに変換される', () => {
        const dsl = [
            'class Counter', '+ countUp(): void',
            'Scenario: count', 'Given ready', 'When called', 'Then done',
            'Flow:', 'for i from 0 to 10', '  do this.increment(i)', 'end',
        ].join('\n');
        const service = new ClassDiagramService(DomainModel.createEmpty());
        new SpecDslParser().parse(dsl, service);
        const ast = service.getOperationByName('Counter', 'countUp')!.workflowAst!;
        const n = (ast.body as any[]).find(n => n.type === 'forRange');
        assert.ok(n); assert.strictEqual(n.variable, 'i'); assert.strictEqual(n.from, '0'); assert.strictEqual(n.to, '10');
    });

    test('[Phase2 AST] break と continue が AST に格納される', () => {
        const dsl = [
            'class Searcher', '+ findFirst(): void',
            'Scenario: find', 'Given items exist', 'When findFirst called', 'Then result returned',
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
        const ast = service.getOperationByName('Searcher', 'findFirst')!.workflowAst!;
        const forEachAst = (ast.body as any[]).find(n => n.type === 'forEach');
        assert.ok(forEachAst);
        const ifInLoop = forEachAst.body.find((n: any) => n.type === 'if');
        assert.ok(ifInLoop);
        assert.ok(ifInLoop.then.find((n: any) => n.type === 'break'), 'break should exist');
        assert.ok(forEachAst.body.find((n: any) => n.type === 'continue'), 'continue should exist');
    });
});
