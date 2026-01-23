import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { FileService } from '../services/FileService';

suite('FileService Test Suite', () => {
    let fileService: FileService;
    let sandbox: sinon.SinonSandbox;

    setup(() => {
        fileService = new FileService();
        sandbox = sinon.createSandbox();
    });

    teardown(() => {
        sandbox.restore();
    });

    test('getDefaultUri should return URI with diagram.json when workspace is open', () => {
        const mockUri = vscode.Uri.file('/test/workspace');
        sandbox.stub(vscode.workspace, 'workspaceFolders').get(() => [
            { uri: mockUri, name: 'test', index: 0 } as vscode.WorkspaceFolder
        ]);

        const result = fileService.getDefaultUri();
        assert.ok(result);
        assert.strictEqual(result?.fsPath.endsWith('diagram.json'), true);
    });

    test('findWorkspaceDiagram should load and parse diagram.json if found', async () => {
        const mockUri = vscode.Uri.file('/test/workspace/diagram.json');
        sandbox.stub(vscode.workspace, 'findFiles').resolves([mockUri]);

        const content = JSON.stringify({ classes: [] });
        const encoder = new TextEncoder();

        const mockFs = {
            readFile: sandbox.stub().resolves(encoder.encode(content))
        };
        sandbox.stub(vscode.workspace, 'fs').get(() => mockFs as any);

        const result = await fileService.findWorkspaceDiagram();
        assert.ok(result);
        assert.strictEqual(result?.content, content);
        assert.deepStrictEqual(result?.parsed, { classes: [] });
    });

    test('loadJson should return null if dialog is cancelled', async () => {
        sandbox.stub(vscode.window, 'showOpenDialog').resolves(undefined);

        const result = await fileService.loadJson();
        assert.strictEqual(result, null);
    });

    test('loadJson should load and parse selected file', async () => {
        const mockUri = vscode.Uri.file('/test/open.json');
        sandbox.stub(vscode.window, 'showOpenDialog').resolves([mockUri]);

        const content = JSON.stringify({ test: true });
        const encoder = new TextEncoder();

        const mockFs = {
            readFile: sandbox.stub().resolves(encoder.encode(content))
        };
        sandbox.stub(vscode.workspace, 'fs').get(() => mockFs as any);

        const result = await fileService.loadJson();
        assert.ok(result);
        assert.deepStrictEqual(result?.parsed, { test: true });
    });

    test('saveJson should write content and return save result', async () => {
        const mockUri = vscode.Uri.file('/test/save.json');
        sandbox.stub(vscode.window, 'showSaveDialog').resolves(mockUri);

        const writeFileStub = sandbox.stub().resolves();
        const mockFs = {
            writeFile: writeFileStub
        };
        sandbox.stub(vscode.workspace, 'fs').get(() => mockFs as any);

        // We also need to stub getDefaultUri's dependency if it calls it
        sandbox.stub(vscode.workspace, 'workspaceFolders').get(() => []);

        const content = { data: 123 };
        const result = await fileService.saveJson(content);

        assert.ok(result);
        assert.strictEqual(result?.uri.fsPath, mockUri.fsPath);
        assert.ok(writeFileStub.calledOnce);

        // Check if correct content was written
        const call = writeFileStub.getCall(0);
        const writtenData = new TextDecoder().decode(call.args[1]);
        assert.ok(writtenData.includes('"data": 123'));
    });
});
