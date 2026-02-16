import { executeAction, parseCommand } from '../../view/lib/command-executor';
import { ClassInfo } from '../../view/lib/class-diagram-types';
import * as assert from 'assert';
import { DomainModel } from '../../view/lib/DomainModel';
import { HandlerResult } from '../../view/lib/handler-registry';
suite('executeAction', () => {
    test('should add a class to empty model', () => {
        const model = DomainModel.createEmpty();
        const command = parseCommand('c User')!;

        const result = executeAction(command, model);

        assert.strictEqual(result.model.getClassCount(), 1);
        assert.strictEqual(result.model.findClassByName('User')?.name, 'User');
        assert.strictEqual(result.model.findClassByName('User')?.kind, 'class');
    });

    test('should add an interface', () => {
        const model = DomainModel.createEmpty();
        const command = parseCommand('i IAuth')!;

        const result = executeAction(command, model);

        assert.strictEqual(result.model.getClassCount(), 1);
        assert.strictEqual(result.model.findClassByName('IAuth')?.name, 'IAuth');
        assert.strictEqual(result.model.findClassByName('IAuth')?.kind, 'interface');
    });
    test('should add abstract class', () => {
        const model = DomainModel.createEmpty();
        const command = parseCommand('ac BaseEntity')!;

        const result = executeAction(command, model);

        const cls = result.model.findClassByName('BaseEntity');
        assert.strictEqual(cls?.kind, 'class');
        assert.strictEqual(cls?.isAbstract, true);
    });
    test('should add class with inheritance', () => {
        const model = DomainModel.createEmpty();

        // まず親クラスを作成
        const userCmd = parseCommand('c User')!;
        const model2 = executeAction(userCmd, model);

        // 継承したクラスを作成
        const adminCmd = parseCommand('c Admin : User')!;
        const result = executeAction(adminCmd, model2.model);

        assert.strictEqual(result.model.getClassCount(), 2);

        const admin = result.model.findClassByName('Admin');
        const user = result.model.findClassByName('User');

        assert.strictEqual(admin?.baseClassId, user?.id);
    });
    test('should add class implementing interface', () => {
        const model = DomainModel.createEmpty();

        const cmd = parseCommand('c User : ILogin')!;
        const result = executeAction(cmd, model);

        assert.strictEqual(result.model.getClassCount(), 2);

        const user = result.model.findClassByName('User');
        const iface = result.model.findClassByName('ILogin');

        assert.strictEqual(iface?.kind, 'interface');
        assert.strictEqual(user?.interfaces[0], iface?.id);
    });
    test('should add attribute to existing class', () => {
        const model = DomainModel.createEmpty();
        const classCmd = parseCommand('c User')!;
        const model2 = executeAction(classCmd, model);

        const attrCmd = parseCommand('a User +name string')!;
        const result = executeAction(attrCmd, model2.model);

        const user = result.model.findClassByName('User');
        assert.strictEqual(user?.members.length, 1);
        assert.strictEqual(user?.members[0].name, 'name');
        assert.strictEqual(user?.members[0].type, 'string');
        assert.strictEqual(user?.members[0].visibility, 'public');
    });

    test('should handle static modifier', () => {
        const model = DomainModel.createEmpty();
        const classCmd = parseCommand('c Config')!;
        const model2 = executeAction(classCmd, model);

        const attrCmd = parseCommand('a Config +s instance Config')!;
        const result = executeAction(attrCmd, model2.model);

        const config = result.model.findClassByName('Config');
        assert.strictEqual(config?.members[0].isStatic, true);
        assert.strictEqual(config?.members[0].name, 'instance');
    });
    test('should add parameter to method', () => {
        const model = DomainModel.createEmpty();

        // クラスとメソッドを作成
        const classCmd = parseCommand('c User')!;
        const model2 = executeAction(classCmd, model);
        const methodCmd = parseCommand('m User +login void')!;
        const model3 = executeAction(methodCmd, model2.model);

        // パラメータを追加
        const paramCmd = parseCommand('p User login username string')!;
        const result = executeAction(paramCmd, model3.model);

        const user = result.model.findClassByName('User');
        const loginMethod = user?.operations.find((op: any) => op.name === 'login');

        assert.strictEqual(loginMethod?.parameters.length, 1);
        assert.strictEqual(loginMethod?.parameters[0].name, 'username');
        assert.strictEqual(loginMethod?.parameters[0].type, 'string');
    });
    test('should delete a class', () => {
        const model = DomainModel.createEmpty();
        const cmd1 = parseCommand('c User')!;
        const cmd2 = parseCommand('c Admin')!;
        const model2 = executeAction(cmd2, executeAction(cmd1, model).model);

        const delCmd = parseCommand('del c User')!;
        const result = executeAction(delCmd, model2.model);

        assert.strictEqual(result.model.getClassCount(), 1);
        assert.strictEqual(result.model.findClassByName('User'), undefined);
        assert.strictEqual(result.model.findClassByName('Admin')?.name, 'Admin');
    });

    test('should delete an attribute', () => {
        const model = DomainModel.createEmpty();
        const classCmd = parseCommand('c User')!;
        const model2 = executeAction(classCmd, model);

        const attr1 = parseCommand('a User +name string')!;
        const attr2 = parseCommand('a User +age int')!;
        const model3 = executeAction(attr2, executeAction(attr1, model2.model).model);

        const delCmd = parseCommand('del a User name')!;
        const result = executeAction(delCmd, model3.model);

        const user = result.model.findClassByName('User');
        assert.strictEqual(user?.members.length, 1);
        assert.strictEqual(user?.members[0].name, 'age');
    });

    test('should not mutate input', () => {
        const model = DomainModel.createEmpty();
        const command = parseCommand('c User')!;

        executeAction(command, model);

        assert.strictEqual(model.getClassCount(), 0); // 元のモデルは変更されていない
    });

    test('should return same reference if no change', () => {
        const model = DomainModel.createEmpty();
        const invalidCommand = null;

        const result = executeAction(invalidCommand!, model);

        assert.strictEqual(result, model); // 同じ参照を返す
    });
    test('should support command chaining', () => {
        let model = DomainModel.createEmpty();
        let result: HandlerResult;
        // 複数のコマンドを連鎖実行
        result = executeAction(parseCommand('c User')!, model);
        model = result.model;
        result = executeAction(parseCommand('a User +name string')!, model);
        model = result.model;
        result = executeAction(parseCommand('a User +age int')!, model);
        model = result.model;
        result = executeAction(parseCommand('m User +getName string')!, model);
        model = result.model;

        const user = model.findClassByName('User');
        assert.strictEqual(user?.members.length, 2);
        assert.strictEqual(user?.operations.length, 1);
    });
});
