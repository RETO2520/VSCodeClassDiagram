import * as vscode from 'vscode';
import assert from 'assert';
import * as path from 'path';
import { CsharpAstParser } from '../services/sourceToDiagram/ast/csharp/CsharpAstParser';
import { Logger } from '../LoggerComponents/Logger';
suite('CsharpAstParser Test Suite', () => {
    console.log("CsharpAstParser test");
    let logger: Logger;
    let parser: CsharpAstParser;

    suiteSetup(() => {
        const mockChannel: vscode.OutputChannel = {
            name: 'Test',
            append: (val) => { console.log(val); },
            appendLine: (val) => { console.log(val); },
            replace: () => { },
            clear: () => { },
            show: () => { },
            hide: () => { },
            dispose: () => { }
        };
        const extensionUri = vscode.Uri.file(path.join(__dirname, '..', '..'));
        logger = new Logger(mockChannel);
        parser = new CsharpAstParser(logger, extensionUri);
    });

    test('supports should return true for csharp', () => {
        assert.strictEqual(parser.supports('csharp'), true);
        assert.strictEqual(parser.supports('typescript'), false);
    });

    test('parse should extract class information from C# source', async () => {
        const content = `
            using System;
                public class BaseClass {
                    public void BaseMethod() {
                        Console.WriteLine("BaseMethod");
                    }
                }
                public class MyClass : BaseClass, IMyInterface {
                    private int _myField;
                    public string MyProperty { get; set; }

                    public void MyMethod(int param1, string param2 = "default") {
                        Console.WriteLine(param1);
                    }

                    protected static abstract void AbstractMethod();
                }

                public interface IMyInterface {
                    void InterfaceMethod();
                }

                public record MyRecord(string Name, int Age);

                public struct MyStruct {
                    public int X;
                }

                public enum MyEnum {
                    Value1,
                    Value2
                }
        `;
        const uri = vscode.Uri.file('/test.cs');
        const classes = await parser.parse(uri, content);

        assert.strictEqual(classes.length, 6, 'Should extract 6 entities');

        // MyClass
        const myClass = classes.find(c => c.name === 'MyClass');
        assert.ok(myClass, 'MyClass should be found');
        assert.strictEqual(myClass.kind, 'class');
        assert.strictEqual(myClass.baseClass, 'BaseClass');
        assert.deepStrictEqual(myClass.interfaces, ['IMyInterface']);

        // Attributes
        assert.strictEqual(myClass.attributes.length, 2);
        const field = myClass.attributes.find(a => a.name === '_myField');
        assert.ok(field);
        assert.strictEqual(field.visibility, 'private');
        assert.strictEqual(field.type, 'int');

        const prop = myClass.attributes.find(a => a.name === 'MyProperty');
        assert.ok(prop);
        assert.strictEqual(prop.visibility, 'public');
        assert.strictEqual(prop.type, 'string');

        // Operations
        assert.strictEqual(myClass.operations.length, 2);
        const method = myClass.operations.find(o => o.name === 'MyMethod');
        assert.ok(method);
        assert.strictEqual(method.returnType, 'void');
        assert.strictEqual(method.parameters.length, 2);
        assert.strictEqual(method.parameters[0].name, 'param1');
        assert.strictEqual(method.parameters[1].isOptional, true);

        // IMyInterface
        const myInterface = classes.find(c => c.name === 'IMyInterface');
        assert.ok(myInterface);
        assert.strictEqual(myInterface.kind, 'interface');

        // MyRecord
        const myRecord = classes.find(c => c.name === 'MyRecord');
        assert.ok(myRecord);
        assert.strictEqual(myRecord.kind, 'class'); // Record is currently mapped to class

        // MyStruct
        const myStruct = classes.find(c => c.name === 'MyStruct');
        assert.ok(myStruct);
        assert.strictEqual(myStruct.kind, 'struct');

        // MyEnum
        const myEnum = classes.find(c => c.name === 'MyEnum');
        assert.ok(myEnum);
        assert.strictEqual(myEnum.kind, 'enum');
    });
});

