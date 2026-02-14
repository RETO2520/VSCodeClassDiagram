import { executeAction, parseCommand } from '../../view/lib/command-executor';
import { ClassInfo } from '../../view/lib/class-diagram-types';
import * as assert from 'assert';
suite('executeAction', () => {

    test('should add a new class', () => {
        const initial: ClassInfo[] = [];
        const command = parseCommand('c User');

        const result = executeAction(command!, initial);

        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].name, 'User');
        assert.strictEqual(result[0].kind, 'class');
    });

    test('should add an interface', () => {
        const initial: ClassInfo[] = [];
        const command = parseCommand('i IAuth');

        const result = executeAction(command!, initial);

        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].name, 'IAuth');
        assert.strictEqual(result[0].kind, 'interface');
    });

    test('should add class with inheritance', () => {
        const initial: ClassInfo[] = [];
        const userCmd = parseCommand('c User');
        const withUser = executeAction(userCmd!, initial);

        const adminCmd = parseCommand('c Admin : User');
        const result = executeAction(adminCmd!, withUser);

        assert.strictEqual(result.length, 2);
        const admin = result.find(c => c.name === 'Admin');
        const user = result.find(c => c.name === 'User');
        assert.strictEqual(admin?.baseClassId, user?.id);
    });

    test('should add attribute to existing class', () => {
        const initial: ClassInfo[] = [];
        const classCmd = parseCommand('c User');
        const withClass = executeAction(classCmd!, initial);

        const attrCmd = parseCommand('a User + name string');
        const result = executeAction(attrCmd!, withClass);

        const user = result.find(c => c.name === 'User');
        assert.strictEqual(user?.members.length, 1);
        assert.strictEqual(user?.members[0].name, 'name');
        assert.strictEqual(user?.members[0].type, 'string');
        assert.strictEqual(user?.members[0].visibility, 'public');
    });

    test('should handle static modifier', () => {
        const initial: ClassInfo[] = [];
        const classCmd = parseCommand('c Config');
        const withClass = executeAction(classCmd!, initial);

        const attrCmd = parseCommand('a Config +s instance Config');
        const result = executeAction(attrCmd!, withClass);
        // デバッグ出力を追加
        console.log('Parsed command:', JSON.stringify(attrCmd, null, 2));
        const config = result.find(c => c.name === 'Config');
        assert.strictEqual(config?.members[0].isStatic, true);
    });

    test('should delete a class', () => {
        const initial: ClassInfo[] = [];
        const cmd1 = parseCommand('c User');
        const cmd2 = parseCommand('c Admin');
        const withClasses = executeAction(cmd2!, executeAction(cmd1!, initial));

        const delCmd = parseCommand('del c User');
        const result = executeAction(delCmd!, withClasses);

        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].name, 'Admin');
    });

    test('should delete an attribute', () => {
        const initial: ClassInfo[] = [];
        const classCmd = parseCommand('c User');
        const withClass = executeAction(classCmd!, initial);

        const attr1 = parseCommand('a User +name string');
        const attr2 = parseCommand('a User +age int');
        const withAttrs = executeAction(attr2!, executeAction(attr1!, withClass));

        const delCmd = parseCommand('del a User name');
        const result = executeAction(delCmd!, withAttrs);

        const user = result.find(c => c.name === 'User');
        assert.strictEqual(user?.members.length, 1);
        assert.strictEqual(user?.members[0].name, 'age');
    });

    test('should not mutate input', () => {
        const initial: ClassInfo[] = [];
        const command = parseCommand('c User');

        executeAction(command!, initial);

        assert.strictEqual(initial.length, 0); // 元の配列は変更されていない
    });

    test('should return same reference if no change', () => {
        const initial: ClassInfo[] = [];
        const command = null;

        const result = executeAction(command!, initial);

        assert.strictEqual(result, initial); // 同じ参照を返す
    });

});
