// src/extension.ts
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { CodeGenerator } from './CodeComponents/CodeGenerator';
import { CppBuilder } from './CodeComponents/CppBuilder';
import { JavaBuilder } from './CodeComponents/JavaBuilder';
import { TypeScriptBuilder } from './CodeComponents/TypeScriptBuilder';
import { CSharpBuilder } from './CodeComponents/CSharpBuilder';
import { RustBuilder } from './CodeComponents/RustBuilder';
export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('classDiagram.open', () => {
      const panel = vscode.window.createWebviewPanel(
        'classDiagram',
        'Class Diagram Editor',
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          retainContextWhenHidden: true
        }
      );

      //panel.webview.html = getHtmlForWebview(panel.webview, context.extensionUri);
      panel.webview.html = getHtmlForWebviewFromFile(panel.webview, context.extensionUri);

      // Receive messages from the webview
      panel.webview.onDidReceiveMessage(async (msg) => {
        switch (msg.command) {
          case 'showAlert':
            {
              vscode.window.showInformationMessage(msg.text);
              // 必要であれば、Webviewに再度メッセージを送り返す
              // panel.webview.postMessage({ command: 'response', text: 'メッセージを受け取りました' });
            }
            break;
          case 'saveJson':
            {
              const workspaceFolders = vscode.workspace.workspaceFolders;
              let defaultUri: vscode.Uri | undefined;

              if (workspaceFolders && workspaceFolders.length > 0) {
                // 最初のワークスペースフォルダを取得
                const workspaceRoot = workspaceFolders[0].uri;
                // デフォルトのファイルパスを結合して Uri を作成
                defaultUri = vscode.Uri.joinPath(workspaceRoot, 'diagram.json');
              } else {
                defaultUri = vscode.Uri.file('diagram.json');
              }

              const uri = await vscode.window.showSaveDialog({
                filters: { 'JSON': ['json'] },
                defaultUri: defaultUri
              });

              if (!uri) return;
              await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(msg.payload, null, 2), 'utf8'));
              vscode.window.showInformationMessage('Saved diagram JSON');
            }
            break;
          case 'loadJson':
            {
              const workspaceFolders = vscode.workspace.workspaceFolders;
              let defaultUri: vscode.Uri | undefined;

              if (workspaceFolders && workspaceFolders.length > 0) {
                // 最初のワークスペースフォルダを取得
                const workspaceRoot = workspaceFolders[0].uri;
                // デフォルトのファイルパスを結合して Uri を作成
                defaultUri = workspaceRoot;
              }
              const uris = await vscode.window.showOpenDialog({
                canSelectFiles: true,
                filters: { 'JSON': ['json'] },
                defaultUri: defaultUri
              });
              if (!uris || uris.length === 0) return;
              const bytes = await vscode.workspace.fs.readFile(uris[0]);
              const json = new TextDecoder('utf8').decode(bytes);
              try {
                const obj = JSON.parse(json);
                panel.webview.postMessage({ command: 'loadedJson', payload: obj });
                vscode.window.showInformationMessage('Loaded diagram JSON');
              } catch (e) {
                vscode.window.showErrorMessage('Invalid JSON');
              }
            }
            break;
          case 'generateCode':
            {
              const payload = msg.payload || {};
              const model = payload.model || payload; // backward compat
              const language = payload.language || 'csharp';
              // ask user for output folder
              const folderUris = await vscode.window.showOpenDialog({ canSelectFolders: true, openLabel: 'Select output folder' });
              if (!folderUris || folderUris.length === 0) return;
              const outFolder = folderUris[0];
              try {
                //await generateCSharpFiles(msg.payload, outFolder);
                await generateCodeFiles(model, outFolder, language);
                vscode.window.showInformationMessage(`${language.toUpperCase()} files generated`);
              } catch (e: any) {
                vscode.window.showErrorMessage('Generate failed: ' + e.message);
              }
            }
            break;
        }
      }, undefined, context.subscriptions);
    })
  );
}

export function deactivate() { }

// -------------------- Utilities --------------------
async function generateCodeFiles(model: any, outFolder: vscode.Uri, language: string) {
  if (!model || !Array.isArray(model.classes)) throw new Error('Invalid model');


  // dispatch to language-specific generator
  switch ((language || 'csharp').toLowerCase()) {
    case 'csharp':
      const csharpBuilder = new CSharpBuilder(model);
      const csharpGen = new CodeGenerator(csharpBuilder);

      await csharpGen.generate(outFolder, model);
      //await generateCSharp(model, outFolder);
      break;
    case 'typescript':
      const typescriptBuilder = new TypeScriptBuilder(model);
      const typescriptGen = new CodeGenerator(typescriptBuilder);
      await typescriptGen.generate(outFolder, model);
      //await generateTypeScript(model, outFolder);
      break;
    case 'java':
      const javaBuilder = new JavaBuilder(model);
      const javaGen = new CodeGenerator(javaBuilder);
      await javaGen.generate(outFolder, model);
      //await generateJava(model, outFolder);
      break;
    case 'cpp':
      const cppBuilder = new CppBuilder(model);
      const cppGen = new CodeGenerator(cppBuilder);
      await cppGen.generate(outFolder, model);
      //await generateCpp(model, outFolder);
      break;
    case 'rust':
      const rustBuilder = new RustBuilder(model);
      const rustGen = new CodeGenerator(rustBuilder);
      await rustGen.generate(outFolder, model);
      break;
    default: throw new Error('Unsupported language: ' + language);
  }
}


// -------------------- Webview HTML --------------------
function getHtmlForWebviewFromFile(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const mediaPath = (p: string) => vscode.Uri.joinPath(extensionUri, 'src', 'media', p);

  // HTML を外部ファイルから読み込む（src/media/index.html）
  const htmlPath = path.join(extensionUri.fsPath, 'src', 'media', 'index.html');
  let html = fs.readFileSync(htmlPath, 'utf8');

  const styleUri = webview.asWebviewUri(mediaPath('style.css'));
  const mainUri = webview.asWebviewUri(mediaPath('main.js'));
  // Webview 用の base を注入して相対パスでの資源解決を有効化
  const mediaUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'src', 'media')).toString();
  html = html.replace(/<head>/i, `<head><base href="${mediaUri}/">`);
  const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource};">`;

  html = html.replace(/%STYLE_CSS%/g, styleUri.toString());
  html = html.replace(/%MAIN_JS%/g, mainUri.toString());
  html = html.replace(/%CSP%/g, csp);

  return html;
}
