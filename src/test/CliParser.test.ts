import * as assert from 'assert';
import { CliParser, AddTypeCommand, AddAttrCommand, AddMethodCommand, AddParamCommand, SetBaseCommand, SetImplCommand, RenameCommand, DeleteCommand, RelationCommand } from '../services/CliParser';

suite('CliParser Test Suite', () => {
    let parser: CliParser;

    setup(() => {
        parser = new CliParser();
    });

    // 1. Type Definitions
    test('parse should correctly handle ADD_TYPE (class, abstract class, interface, struct, enum)', () => {
        const testCases = [
            { input: 'c User', kind: 'c', name: 'User' },
            { input: 'ac BaseEntity', kind: 'ac', name: 'BaseEntity' },
            { input: 'i ILogin', kind: 'i', name: 'ILogin' },
            { input: 's Point', kind: 's', name: 'Point' },
            { input: 'e Status', kind: 'e', name: 'Status' }
        ];

        for (const tc of testCases) {
            const result = parser.parse(tc.input) as AddTypeCommand;
            assert.strictEqual(result.type, 'ADD_TYPE');
            assert.strictEqual(result.kind, tc.kind);
            assert.strictEqual(result.name, tc.name);
        }
    });

    test('parse should handle type inheritance in ADD_TYPE', () => {
        const result = parser.parse('c Admin : User, ILogin') as AddTypeCommand;
        assert.strictEqual(result.type, 'ADD_TYPE');
        assert.strictEqual(result.name, 'Admin');
        assert.deepStrictEqual(result.extends, ['User', 'ILogin']);
    });

    // 2. Attribute Definitions
    test('parse should handle ADD_ATTR with visibility and modifiers', () => {
        const testCases = [
            { input: 'a User +name string', visibility: 'public', modifier: undefined, name: 'name', dataType: 'string' },
            { input: 'a Point -x int', visibility: 'private', modifier: undefined, name: 'x', dataType: 'int' },
            { input: 'a Config ~s instance Config', visibility: 'package', modifier: 'static', name: 'instance', dataType: 'Config' },
            { input: 'a Shape #a area float', visibility: 'protected', modifier: 'abstract', name: 'area', dataType: 'float' }
        ];

        for (const tc of testCases) {
            const result = parser.parse(tc.input) as AddAttrCommand;
            assert.strictEqual(result.type, 'ADD_ATTR', `Failed for: ${tc.input}`);
            assert.strictEqual(result.visibility, tc.visibility);
            assert.strictEqual(result.modifier, tc.modifier);
            assert.strictEqual(result.name, tc.name);
            assert.strictEqual(result.dataType, tc.dataType);
        }
    });

    // 3. Method Definitions
    test('parse should handle ADD_METHOD with visibility and modifiers', () => {
        const testCases = [
            { input: 'm User +login void', visibility: 'public', modifier: undefined, name: 'login', returnType: 'void' },
            { input: 'm Base #v onInit void', visibility: 'protected', modifier: 'virtual', name: 'onInit', returnType: 'void' },
            { input: 'm Service +s getInstance Service', visibility: 'public', modifier: 'static', name: 'getInstance', returnType: 'Service' }
        ];

        for (const tc of testCases) {
            const result = parser.parse(tc.input) as AddMethodCommand;
            assert.strictEqual(result.type, 'ADD_METHOD', `Failed for: ${tc.input}`);
            assert.strictEqual(result.visibility, tc.visibility);
            assert.strictEqual(result.modifier, tc.modifier);
            assert.strictEqual(result.name, tc.name);
            assert.strictEqual(result.returnType, tc.returnType);
        }
    });

    // 4. Parameter Definitions
    test('parse should handle ADD_PARAM', () => {
        const result = parser.parse('p User login username string') as AddParamCommand;
        assert.strictEqual(result.type, 'ADD_PARAM');
        assert.strictEqual(result.className, 'User');
        assert.strictEqual(result.methodName, 'login');
        assert.strictEqual(result.name, 'username');
        assert.strictEqual(result.dataType, 'string');
    });

    // 5. Inheritance & Implementation
    test('parse should handle SET_BASE and SET_IMPL', () => {
        const baseResult = parser.parse('base Admin User') as SetBaseCommand;
        assert.strictEqual(baseResult.type, 'SET_BASE');
        assert.strictEqual(baseResult.className, 'Admin');
        assert.strictEqual(baseResult.baseClassName, 'User');

        const implResult = parser.parse('impl Admin ILogin') as SetImplCommand;
        assert.strictEqual(implResult.type, 'SET_IMPL');
        assert.strictEqual(implResult.className, 'Admin');
        assert.strictEqual(implResult.interfaceName, 'ILogin');
    });

    // 6. Rename Command
    test('parse should handle RENAME for classes and members', () => {
        const classRen = parser.parse('ren c User Member') as RenameCommand;
        assert.strictEqual(classRen.target, 'c');
        assert.strictEqual(classRen.className, 'User');
        assert.strictEqual(classRen.oldName, 'User');
        assert.strictEqual(classRen.newName, 'Member');

        const attrRen = parser.parse('ren a User name firstName') as RenameCommand;
        assert.strictEqual(attrRen.target, 'a');
        assert.strictEqual(attrRen.className, 'User');
        assert.strictEqual(attrRen.oldName, 'name');
        assert.strictEqual(attrRen.newName, 'firstName');
    });

    // 7. Delete Command
    test('parse should handle DELETE', () => {
        const classDel = parser.parse('del c User') as DeleteCommand;
        assert.strictEqual(classDel.target, 'c');
        assert.strictEqual(classDel.className, 'User');

        const attrDel = parser.parse('del a User name') as DeleteCommand;
        assert.strictEqual(attrDel.target, 'a');
        assert.strictEqual(attrDel.className, 'User');
        assert.strictEqual(attrDel.name, 'name');
    });

    // 8. Complex Types (Arrays and Generics)
    test('parse should handle complex types (arrays and generics)', () => {
        const attrResult = parser.parse('a User +roles string[]') as AddAttrCommand;
        assert.strictEqual(attrResult.dataType, 'string[]');

        const genericAttr = parser.parse('a Store -items List<Product>') as AddAttrCommand;
        assert.strictEqual(genericAttr.dataType, 'List<Product>');
    });

    // 9. Relationship Commands
    test('parse should handle relationship symbols and multiplicity', () => {
        const testCases = [
            { input: 'A -> B', source: 'A', symbol: '->', target: 'B', multiplicity: undefined },
            { input: 'A *> : 0..* B', source: 'A', symbol: '*>', target: 'B', multiplicity: '0..*' },
            { input: 'A o> : 1 B', source: 'A', symbol: 'o>', target: 'B', multiplicity: '1' }
        ];

        for (const tc of testCases) {
            const result = parser.parse(tc.input) as RelationCommand;
            assert.strictEqual(result.type, 'RELATION');
            assert.strictEqual(result.source, tc.source);
            assert.strictEqual(result.symbol, tc.symbol);
            assert.strictEqual(result.target, tc.target);
            assert.strictEqual(result.multiplicity, tc.multiplicity);
        }
    });

    test('parse should return null for invalid commands', () => {
        assert.strictEqual(parser.parse(''), null);
        assert.strictEqual(parser.parse('   '), null);
        assert.strictEqual(parser.parse('invalidCommand'), null);
    });
});
