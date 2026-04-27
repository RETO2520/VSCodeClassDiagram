import * as assert from 'assert';
import { SpecDslParser } from '../../view/lib/SpecDslParser';
import { ClassDiagramService } from '../../view/lib/application/ClassDiagramService';
import { DomainModel } from '../../view/lib/DomainModel';

suite('SpecDslParser Flow DSL', () => {

    function parse(dsl: string) {
        const service = new ClassDiagramService(DomainModel.createEmpty());
        new SpecDslParser().parse(dsl, service);
        return service;
    }

    // ─────────────────────────────────────────────────────────────
    // Phase 1
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
        const service = parse(dsl);
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
        const service = parse(dsl);
        const op = service.getOperationByName('BatchService', 'run');
        assert.ok(op?.workflowAst);
        const ast = op!.workflowAst!;
        const whileNode = (ast.body as any[]).find(n => n.type === 'while');
        assert.ok(whileNode); assert.strictEqual(whileNode.condition, 'hasNext()');
        assert.ok((ast.body as any[]).find(n => n.type === 'return'));
    });

    // ─────────────────────────────────────────────────────────────
    // 独立性
    // ─────────────────────────────────────────────────────────────

    test('[独立性] workflow は Gherkin ノードのみを含み Flow ノードを含まない', () => {
        const dsl = [
            'class PaymentService', '+ approve(amount:number): boolean',
            'Scenario: approval', 'Given amount is positive', 'When approve is called', 'Then result is returned',
            'Flow:', 'if amount > 0', '  do this.markApproved()', '  return true',
            'else', '  do this.markRejected()', '  return false', 'end',
        ].join('\n');
        const service = parse(dsl);
        const op = service.getOperationByName('PaymentService', 'approve');
        assert.ok(op?.workflow); assert.ok(op?.workflowAst);
        const workflowTypes = op!.workflow!.nodes.map(n => n.type);
        for (const t of ['decision', 'loop', 'foreach', 'forrange', 'switch', 'break', 'continue']) {
            assert.ok(!workflowTypes.includes(t), `workflow should NOT contain "${t}"`);
        }
    });

    // ─────────────────────────────────────────────────────────────
    // switch バグ修正
    // ─────────────────────────────────────────────────────────────

    test('[switch bugfix] 2番目以降の case が前の case ボディに流れ込まない', () => {
        const dsl = [
            'class StatusHandler', '+ handle(): void',
            'Scenario: handle status', 'Given status is set', 'When handle is called', 'Then action is taken',
            'Flow:',
            'switch this.status',
            '  case "pending":',   '    do this.initialize()',
            '  case "active":',    '    do this.execute()',
            '  case "closed":',    '    do this.archive()',
            '  default:',          '    do this.skip()',
            'end',
        ].join('\n');
        const service = parse(dsl);
        const ast = service.getOperationByName('StatusHandler', 'handle')!.workflowAst!;
        const sw = (ast.body as any[]).find(n => n.type === 'switch');
        assert.ok(sw); assert.strictEqual(sw.cases.length, 3);
        assert.strictEqual(sw.cases[0].value, '"pending"');
        assert.strictEqual(sw.cases[0].body.length, 1);
        assert.strictEqual(sw.cases[0].body[0].statement, 'this.initialize()');
        assert.strictEqual(sw.cases[1].value, '"active"');
        assert.strictEqual(sw.cases[1].body.length, 1);
        assert.strictEqual(sw.cases[1].body[0].statement, 'this.execute()');
        assert.strictEqual(sw.cases[2].value, '"closed"');
        assert.strictEqual(sw.cases[2].body.length, 1);
        assert.ok(Array.isArray(sw.default) && sw.default.length === 1);
        assert.strictEqual(sw.default[0].statement, 'this.skip()');
    });

    // ─────────────────────────────────────────────────────────────
    // switch end 処理バグ修正: switch の end がトップレベルに漏れない
    // ─────────────────────────────────────────────────────────────

    test('[switch end bugfix] switch を含む if の後のステートメントがトップレベルに配置される', () => {
        const dsl = [
            'class Handler', '+ handle(): void',
            'Scenario: complex', 'Given ready', 'When called', 'Then done',
            'Flow:',
            'if normalized',
            '  do this.markCompleted()',
            '  for item in this.items',
            '    do item.process()',
            '    if item.invalid',
            '      break',
            '    end',
            '    do item.finalize()',
            '  end',
            'else',
            '  do this.markRejected()',
            '  switch this.status',
            '    case "pending":',
            '      do this.initialize()',
            '    case "active":',
            '      do this.execute()',
            '      return true',
            '    case "queue":',
            '      do this.queue()',
            '    default:',
            '      return false',
            '  end',
            'end',
            'do test()',
        ].join('\n');
        const service = parse(dsl);
        const ast = service.getOperationByName('Handler', 'handle')!.workflowAst!;
        const body = ast.body as any[];

        // トップレベルは if と do test() の2ノード
        assert.strictEqual(body.length, 2, `top-level body should have 2 nodes, got ${body.length}: ${body.map(n=>n.type+':'+(n.condition??n.statement??'')).join(', ')}`);
        assert.strictEqual(body[0].type, 'if');
        assert.strictEqual(body[1].type, 'action');
        assert.strictEqual(body[1].statement, 'test()');

        // else の末尾が do test() ではなく switch であること
        const ifNode = body[0];
        const lastElse = ifNode.else[ifNode.else.length - 1];
        assert.strictEqual(lastElse.type, 'switch', `else 末尾は switch のはず (got ${lastElse.type})`);
    });

    // ─────────────────────────────────────────────────────────────
    // Phase 2 AST
    // ─────────────────────────────────────────────────────────────

    test('[Phase2 AST] for...in が forEach ノードに変換される', () => {
        const dsl = [
            'class OrderProcessor', '+ processAll(): void',
            'Scenario: process all', 'Given orders exist', 'When processAll is called', 'Then each processed',
            'Flow:', 'for order in this.orders', '  do order.process()', 'end',
        ].join('\n');
        const service = parse(dsl);
        const ast = service.getOperationByName('OrderProcessor', 'processAll')!.workflowAst!;
        const n = (ast.body as any[]).find(n => n.type === 'forEach');
        assert.ok(n); assert.strictEqual(n.variable, 'order'); assert.strictEqual(n.collection, 'this.orders');
    });

    test('[Phase2 AST] for...from...to が forRange ノードに変換される', () => {
        const dsl = [
            'class Counter', '+ countUp(): void',
            'Scenario: count', 'Given ready', 'When called', 'Then done',
            'Flow:', 'for i from 0 to 10', '  do this.increment(i)', 'end',
        ].join('\n');
        const service = parse(dsl);
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
        const service = parse(dsl);
        const ast = service.getOperationByName('Searcher', 'findFirst')!.workflowAst!;
        const forEachAst = (ast.body as any[]).find(n => n.type === 'forEach');
        assert.ok(forEachAst);
        const ifInLoop = forEachAst.body.find((n: any) => n.type === 'if');
        assert.ok(ifInLoop);
        assert.ok(ifInLoop.then.find((n: any) => n.type === 'break'), 'break should exist');
        assert.ok(forEachAst.body.find((n: any) => n.type === 'continue'), 'continue should exist');
    });
});
