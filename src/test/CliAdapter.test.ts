import * as assert from 'assert';
import { CliParser } from '../../view/lib/CliParser';
import { cliCommandToInput } from '../../view/lib/adapters/cli-adapter';
import path from 'path';

suite('CliAdapter Test Suite', () => {
    let parser: CliParser;

    setup(() => {
        parser = new CliParser();
    });

    test('help command converts to HelpInput', () => {
        const cmd = parser.parse('help');
        const input = cliCommandToInput(cmd as any);
        assert.ok(input);
        assert.deepStrictEqual(input, {});
    });

    test('sel command converts to SelectInput', () => {
        const cmd = parser.parse('sel User');
        const input = cliCommandToInput(cmd as any) as any;
        assert.strictEqual(input.className, 'User');
    });

    test('export command converts to ExportInput', () => {
        const cmd1 = parser.parse('export json') as any;
        const in1 = cliCommandToInput(cmd1) as any;
        assert.strictEqual(in1.format, 'json');

        const cmd2 = parser.parse('export svg Admin') as any;
        const in2 = cliCommandToInput(cmd2) as any;
        assert.strictEqual(in2.format, 'svg');
        assert.strictEqual(in2.target, 'Admin');
    });

    test('import command converts to ImportInput', () => {
        const cmd = parser.parse('import json /path/to/file.json') as any;
        const input = cliCommandToInput(cmd) as any;
        assert.strictEqual(input.format, 'json');
        assert.strictEqual(input.path, '/path/to/file.json');
    });

    test('save/load/clear/list commands', () => {
        const s = parser.parse('save') as any;
        const si = cliCommandToInput(s) as any;
        assert.deepStrictEqual(si, { path: undefined });

        const sl = parser.parse('save /tmp/out.json') as any;
        const sli = cliCommandToInput(sl) as any;
        assert.strictEqual(sli.path, '/tmp/out.json');

        const l = parser.parse('load /tmp/out.json') as any;
        const li = cliCommandToInput(l) as any;
        assert.strictEqual(li.path, '/tmp/out.json');

        const c = parser.parse('clear') as any;
        const ci = cliCommandToInput(c) as any;
        assert.deepStrictEqual(ci, {});

        const lst = parser.parse('list classes') as any;
        const lsti = cliCommandToInput(lst) as any;
        assert.strictEqual(lsti.subject, 'classes');
    });
});
