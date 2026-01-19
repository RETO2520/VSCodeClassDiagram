//import * as assert from 'assert';

/*
 * You can import and use all API from the 'vscode' module
 * as well as import your extension to test it
 */
import * as vscode from 'vscode';
// import * as myExtension from '../../extension';
import { buildClassMaps, collectInheritedMembers, opSignatureKey, TypeModel, pascalCase, safeIdentifier, typeName, CodeGenerator } from '../CodeComponents/CodeGenerator';
import { TypeScriptBuilder } from '../CodeComponents/TypeScriptBuilder';
import { CSharpBuilder } from '../CodeComponents/CSharpBuilder';
import { JavaBuilder } from '../CodeComponents/JavaBuilder';
import { CppBuilder } from '../CodeComponents/CppBuilder';
import * as os from 'os';
import * as path from 'path';
import type { IObjectModel, IClassModel } from '../CodeComponents/CodeGenerator';
import assert from 'assert';
suite('Extension Test Suite', () => {
    vscode.window.showInformationMessage('Start all tests.');

    test('Sample test', () => {
        console.log('Sample test');

        assert.strictEqual(-1, [1, 2, 3].indexOf(5));
        assert.strictEqual(-1, [1, 2, 3].indexOf(0));
    });
});

suite('コード生成のテストケース', () => {
    vscode.window.showInformationMessage('Start all tests.');

    test('TypeScriptBuilder generates files with imports and class declarations', async () => {
        const thing: IClassModel = {
            id: 't', name: 'Thing', x: 0, y: 0, width: 0, height: 0,
            baseClass: '', baseClassId: null as any, interfaces: [], isAbstract: false, isInterface: false,
            attributes: [],
            operations: []
        } as any;

        const holder: IClassModel = {
            id: 'h', name: 'Holder', x: 0, y: 0, width: 0, height: 0,
            baseClass: '', baseClassId: null as any, interfaces: [], isAbstract: false, isInterface: false,
            attributes: [{ name: 'thing', type: 'Thing', visibility: 'public', modifier: 'None' }],
            operations: []
        } as any;

        const model: IObjectModel = { classes: [thing, holder] };

        const tmpBase = path.join(os.tmpdir(), `vscctest_${Date.now()}`);
        const outUri = vscode.Uri.file(tmpBase);
        await vscode.workspace.fs.createDirectory(outUri);
        const tm = new TypeModel();
        const b = new TypeScriptBuilder(model, tm);
        await b.Build(outUri);

        const holderUri = vscode.Uri.joinPath(outUri, 'Holder.ts');
        const thingUri = vscode.Uri.joinPath(outUri, 'Thing.ts');

        const holderBytes = await vscode.workspace.fs.readFile(holderUri);
        const holderText = Buffer.from(holderBytes).toString('utf8');
        assert.ok(holderText.includes("export class Holder") || holderText.includes("export interface Holder"));
        assert.ok(holderText.includes("import type { Thing } from './Thing'") || holderText.includes("import type { Thing } from './Thing';"));

        const thingBytes = await vscode.workspace.fs.readFile(thingUri);
        const thingText = Buffer.from(thingBytes).toString('utf8');
        assert.ok(thingText.includes('export class Thing') || thingText.includes('export interface Thing'));
    });

});

suite('モデルのテストケース', () => {
    vscode.window.showInformationMessage('Start all tests.');
    console.log("Start all test");
    const base: IClassModel = {
        id: 'base', name: 'Base', x: 0, y: 0, width: 0, height: 0,
        baseClass: '', baseClassId: null as any, interfaces: [], isAbstract: false, isInterface: false,
        attributes: [{ name: 'a1', type: 'int', visibility: 'private', modifier: 'None' }],
        operations: [{ name: 'op1', returnType: 'void', visibility: 'public', modifier: 'None', parameters: [] }]
    } as any;

    const iface: IClassModel = {
        id: 'iface', name: 'Iface', x: 0, y: 0, width: 0, height: 0,
        baseClass: '', baseClassId: null as any, interfaces: [], isAbstract: true, isInterface: true,
        attributes: [],
        operations: [{ name: 'ifOp', returnType: 'void', visibility: 'public', modifier: 'abstract', parameters: [] }]
    } as any;

    const derived: IClassModel = {
        id: 'd', name: 'Derived', x: 0, y: 0, width: 0, height: 0,
        baseClass: '', baseClassId: 'base', interfaces: ['iface'], isAbstract: false, isInterface: false,
        attributes: [{ name: 'd1', type: 'string', visibility: 'public', modifier: 'None' }],
        operations: [{ name: 'op1', returnType: 'void', visibility: 'public', modifier: 'override', parameters: [] }]
    } as any;

    const model: IObjectModel = { classes: [base, iface, derived] };
    const maps = buildClassMaps(model);

    //assert(maps.nameToClass['Base'] === base);

    //assert(maps.idToClass['d'] === derived);

    const sig = opSignatureKey(derived.operations[0]);
    //assert.strictEqual(sig, 'op1()');

    const inherited = collectInheritedMembers(derived, model, maps as any);
    // Base has attribute a1 and operation op1 (but op1 overridden in derived so op signature from base may be present)
    //assert(inherited.attributes.has('a1'));
    // interface has ifOp
    //assert(inherited.operations.has('ifOp()'));

    const tm = new TypeModel();
    const tt = tm.mapTypeForLang('int', 'typescript');
    //assert.strictEqual(tt.name, 'number');


    test('utility: pascalCase and safeIdentifier and typeName', () => {
        assert.strictEqual(pascalCase('hello_world'), 'HelloWorld');
        assert.strictEqual(pascalCase('user-id'), 'UserId');
        assert.strictEqual(pascalCase(''), 'Unnamed');

        assert.strictEqual(safeIdentifier('simpleName'), 'simpleName');
        assert.strictEqual(safeIdentifier('123name'), '_123name');
        assert.strictEqual(safeIdentifier('a b/c'), 'a_b_c');
        assert.strictEqual(safeIdentifier(''), 'Unnamed');

        assert.strictEqual(typeName('int'), 'int');
        assert.strictEqual(typeName('CustomType'), 'CustomType');
    });

    test('check1', () => {
        assert(maps.nameToClass['Base'] === base);
    });
    test('check2', () => {
        assert(maps.idToClass['d'] === derived);
    });
    test('check3', () => {
        assert.strictEqual(sig, 'op1()');
    });
    test('check4', () => {
        assert(inherited.attributes.has('a1'));
    });
    test('check5', () => {
        assert(inherited.operations.has('ifOp()'));
    });
    test('check6', () => {
        assert.strictEqual(tt.name, 'number');
    });

    test('TypeModel cpp List<> mapping and initial values', () => {
        const tm2 = new TypeModel();
        const mapped = tm2.mapTypeForLang('List<int>', 'cpp');
        assert.strictEqual(mapped.name, 'std::vector<int>');

        const mnum = tm2.mapTypeForLang('int', 'typescript');
        assert.strictEqual(mnum.name, 'number');
        // initial for string
        const mstr = tm2.mapTypeForLang('string', 'typescript');
        assert.strictEqual(mstr.name, 'string');
    });

    test('CodeGenerator calls builder.Build and handles null builder', async () => {
        const calls: any = { called: false, args: null };
        class MockBuilder {
            Build(outputFolder: vscode.Uri, model: IObjectModel) {
                calls.called = true;
                calls.args = { outputFolder, model };
                return Promise.resolve();
            }
        }

        const mock = new MockBuilder() as any;
        const cg = new CodeGenerator(mock);
        await cg.generate(vscode.Uri.parse('untitled:mock'));
        assert.strictEqual(calls.called, true);
        assert.strictEqual(calls.args.model, model);

        const cg2 = new CodeGenerator(null);
        const res = await cg2.generate(vscode.Uri.parse('untitled:mock'));
        assert.strictEqual(res, null);
    });
});