import * as assert from 'assert';
import { SpecDslParser } from '../../view/lib/SpecDslParser';
import { ClassDiagramService } from '../../view/lib/application/ClassDiagramService';
import { DomainModel } from '../../view/lib/DomainModel';

suite('SpecDslParser Flow DSL', () => {
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
            'do this.markCompleted()',
            'return true',
            'else',
            'do this.markRejected()',
            'return false',
            'end',
        ].join('\n');

        const service = new ClassDiagramService(DomainModel.createEmpty());
        const parser = new SpecDslParser();
        parser.parse(dsl, service);

        const cls = service.getClassByName('OrderService');
        assert.ok(cls);
        const op = service.getOperationByName('OrderService', 'process');
        assert.ok(op);

        assert.ok(op!.workflow && op!.workflow.nodes.length >= 3);
        assert.ok(op!.workflowAst);

        const ast = op!.workflowAst!;
        assert.strictEqual(ast.variables.length, 1);
        assert.strictEqual(ast.variables[0].name, 'normalized');
        assert.strictEqual(ast.variables[0].type, 'boolean');

        const ifNode = (ast.body as any[]).find(n => n.type === 'if');
        assert.ok(ifNode);
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
            'do this.consumeNext()',
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
        assert.ok(whileNode);
        assert.strictEqual(whileNode.condition, 'hasNext()');
        assert.strictEqual(whileNode.body[0].type, 'action');

        const returnNode = (ast.body as any[]).find(n => n.type === 'return');
        assert.ok(returnNode);
    });
});
