// src/extension.ts
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { CodeGenerator, IObjectModel, TypeModel } from './CodeComponents/CodeGenerator';
import { CppBuilder } from './CodeComponents/CppBuilder';
import { JavaBuilder } from './CodeComponents/JavaBuilder';
import { TypeScriptBuilder } from './CodeComponents/TypeScriptBuilder';
import { CSharpBuilder } from './CodeComponents/CSharpBuilder';
import { RustBuilder } from './CodeComponents/RustBuilder';
import { Logger } from './LoggerComponents/Logger';

export function activate(context: vscode.ExtensionContext) {
  const tm: TypeModel = new TypeModel();
  const logger = new Logger(vscode.window.createOutputChannel("Class Diagram Editor Log"));
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

      panel.webview.html = getHtmlForWebviewFromFile(panel.webview, context.extensionUri);

      // Receive messages from the webview
      panel.webview.onDidReceiveMessage(async (msg) => {

        switch (msg.command) {
          case "requestWorkspaceDiagram": {
            // ワークスペースに diagram.json があれば優先して返す
            const files = await vscode.workspace.findFiles("**/diagram.json", "**/node_modules/**", 1);
            if (files.length > 0) {
              const uri = files[0];
              const contentBytes = await vscode.workspace.fs.readFile(uri);
              const json = new TextDecoder('utf8').decode(contentBytes);
              const obj = JSON.parse(json);
              panel.webview.postMessage({
                command: "loadedJson",
                payload: obj
              });
            }
            break;
          }
          case 'changedPrimitiveTypes':
            {
              const ptypes = tm.getTypesForLang(msg.language);
              panel.webview.postMessage({
                command: 'changedPrimitiveTypes',
                primitiveTypes: ptypes
              });
            }
            break;
          case 'showAlert':
            {
              vscode.window.showInformationMessage(msg.text);
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
                filters: {
                  'JSON': ['json']
                },
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
                filters: {
                  'JSON': ['json']
                },
                defaultUri: defaultUri
              });
              if (!uris || uris.length === 0) return;
              const bytes = await vscode.workspace.fs.readFile(uris[0]);
              const json = new TextDecoder('utf8').decode(bytes);
              try {
                const obj = JSON.parse(json);
                panel.webview.postMessage({
                  command: 'loadedJson',
                  payload: obj
                });
                vscode.window.showInformationMessage('Loaded diagram JSON');
              } catch (e) {
                vscode.window.showErrorMessage(`Invalid JSON ${e}`);
              }
            }
            break;
          case 'generateCode':
            {
              const payload = msg.payload || {
              };
              const model = payload.model || payload; // backward compat
              const language = payload.language || 'csharp';
              const folderUris = await vscode.window.showOpenDialog({
                canSelectFolders: true,
                openLabel: 'Select output folder'
              });
              if (!folderUris || folderUris.length === 0) return;
              const outFolder = folderUris[0];
              try {
                //await generateCSharpFiles(msg.payload, outFolder);
                await generateCodeFiles(model, tm, logger, outFolder, language);
                vscode.window.showInformationMessage(`${language.toUpperCase()} Code generation completed.`);
              } catch (e: unknown) {
                if (e instanceof Error) {
                  vscode.window.showErrorMessage('Generate failed: ' + e.message);
                }

              }
            }
            break;
        }
      }, undefined, context.subscriptions);

      const ptypes = tm.getTypesForLang('csharp');
      panel.webview.postMessage({
        command: 'changedPrimitiveTypes',
        primitiveTypes: ptypes
      });
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('workflowDiagram.open', () => {
      const panel = vscode.window.createWebviewPanel(
        "workflow",
        "Workflow Diagram",
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          retainContextWhenHidden: true
        }
      );

      const mediaPath = path.join(context.extensionPath, "media.workflow");
      const indexPath = path.join(mediaPath, "index.html");
      let html = fs.readFileSync(indexPath, {
        encoding: "utf8"
      });

      const styleUri = panel.webview.asWebviewUri(
        vscode.Uri.file(path.join(mediaPath, "style.css"))
      );

      // base を注入して相対モジュール import を有効化
      const baseUri = panel.webview.asWebviewUri(vscode.Uri.file(mediaPath)).toString();
      html = html.replace(/<head>/i, `<head><base href="${baseUri}/">`);

      // 脆弱性回避のために CSP をメタタグとして注入（スクリプトは webview.cspSource からのみ許可）
      const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${panel.webview.cspSource} data:; style-src ${panel.webview.cspSource} 'unsafe-inline'; script-src ${panel.webview.cspSource};">`;

      // webview.cspSource を挿入（安全なスキーム）
      html = html.replace(/__STYLE_URI__/g, styleUri.toString());
      //html = html.replace(/__SCRIPT_URI__/g, scriptUri.toString());
      html = html.replace(/__CSP_SOURCE__/g, csp);
      //html = html.replace(/__CSP_SOURCE__/g, panel.webview.cspSource);

      panel.webview.html = html;

      panel.webview.onDidReceiveMessage(async (msg) => {
        try {
          switch (msg.type) {
            case "alert": {
              vscode.window.showInformationMessage(msg.text);
              break;
            };

            case "requestWorkspaceDiagram": {
              // ワークスペースに diagram.json があれば優先して返す
              const files = await vscode.workspace.findFiles("**/diagram.json", "**/node_modules/**", 1);
              if (files.length > 0) {
                const uri = files[0];
                const contentBytes = await vscode.workspace.fs.readFile(uri);
                const content = Buffer.from(contentBytes).toString("utf8");
                panel.webview.postMessage({
                  type: "fileLoaded",
                  filePath: uri.fsPath,
                  content
                });
              } else {
                // ない場合は空構造を返す
                panel.webview.postMessage({
                  type: "fileLoaded",
                  filePath: null,
                  content: JSON.stringify({
                    classes: []
                  }, null, 2)
                });
              }
              break;
            }

            case "openFile": {
              // ユーザーに選択させて JSON を読み込み、返す
              const uris = await vscode.window.showOpenDialog({
                canSelectMany: false,
                filters: {
                  "JSON": ["json"]
                },
                openLabel: "Load JSON"
              });
              if (!uris || uris.length === 0) {
                panel.webview.postMessage({
                  type: "openCanceled"
                });
                break;
              }
              const uri = uris[0];
              const bytes = await vscode.workspace.fs.readFile(uri);
              const content = Buffer.from(bytes).toString("utf8");
              panel.webview.postMessage({
                type: "fileLoaded",
                filePath: uri.fsPath,
                content
              });
              break;
            }

            case "saveFile": {
              // webview が渡す content を保存する（保存先をユーザーに選ばせる）
              const defaultUri = (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0])
                ? vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, "diagram.json")
                : undefined;

              const uri = await vscode.window.showSaveDialog({
                defaultUri,
                filters: {
                  "JSON": ["json"]
                },
                saveLabel: "Save JSON"
              });

              if (!uri) {
                panel.webview.postMessage({
                  type: "saveCanceled"
                });
                break;
              }

              const contentStr: string = msg.content || "{}";
              const enc = new TextEncoder();
              await vscode.workspace.fs.writeFile(uri, enc.encode(contentStr));
              panel.webview.postMessage({
                type: "saveCompleted",
                filePath: uri.fsPath
              });
              break;
            }

            default:
              console.log("Unknown message from webview:", msg);
          }
        } catch (e: unknown) {
          if (e instanceof Error) {
            panel.webview.postMessage({
              type: "error",
              message: e.message
            });
          }

        }
      });
    })
  );
  context.subscriptions.push(logger);
}

export function deactivate() {

}

// -------------------- Utilities --------------------
async function generateCodeFiles(model: IObjectModel, typeModel: TypeModel, logger: Logger, outFolder: vscode.Uri, language: string) {
  if (!model || !Array.isArray(model.classes)) throw new Error('Invalid model');


  // dispatch to language-specific generator
  switch ((language || 'csharp').toLowerCase()) {
    case 'csharp':
      {
        const csharpBuilder = new CSharpBuilder(model, typeModel, logger);
        const csharpGen = new CodeGenerator(csharpBuilder);
        await csharpGen.generate(outFolder);
      }
      break;
    case 'typescript':
      {
        const typescriptBuilder = new TypeScriptBuilder(model, typeModel, logger);
        const typescriptGen = new CodeGenerator(typescriptBuilder);
        await typescriptGen.generate(outFolder);
      }
      break;
    case 'java':
      {
        const javaBuilder = new JavaBuilder(model, typeModel, logger);
        const javaGen = new CodeGenerator(javaBuilder);
        await javaGen.generate(outFolder);
      }
      break;
    case 'cpp':
      {
        const cppBuilder = new CppBuilder(model, typeModel, logger);
        const cppGen = new CodeGenerator(cppBuilder);
        await cppGen.generate(outFolder);
      }
      break;
    case 'rust':
      {
        const rustBuilder = new RustBuilder(model, typeModel, logger);
        const rustGen = new CodeGenerator(rustBuilder);
        await rustGen.generate(outFolder);
      }
      break;
    default: throw new Error('Unsupported language: ' + language);
  }
}


// -------------------- Webview HTML --------------------
function getHtmlForWebviewFromFile(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const mediaPath = (p: string) => vscode.Uri.joinPath(extensionUri, 'media', p);

  // HTML を外部ファイルから読み込む（src/media/index.html）
  const htmlPath = path.join(extensionUri.fsPath, 'media', 'index.html');
  let html = fs.readFileSync(htmlPath, 'utf8');

  const styleUri = webview.asWebviewUri(mediaPath('style.css'));
  const mainUri = webview.asWebviewUri(mediaPath('main.js'));
  // Webview 用の base を注入して相対パスでの資源解決を有効化
  const mediaUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media')).toString();
  html = html.replace(/<head>/i, `<head><base href="${mediaUri}/">`);
  const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource};">`;

  html = html.replace(/%STYLE_CSS%/g, styleUri.toString());
  html = html.replace(/%MAIN_JS%/g, mainUri.toString());
  html = html.replace(/%CSP%/g, csp);

  return html;
}

