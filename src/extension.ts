import * as vscode from 'vscode';
import { TypeModel } from './CodeComponents/CodeGenerator';
import { Logger } from './LoggerComponents/Logger';
import { ClassDiagramHandler } from './handlers/ClassDiagramHandler';
import { WorkflowDiagramHandler } from './handlers/WorkflowDiagramHandler';

export function activate(context: vscode.ExtensionContext) {
  // 共通サービスの初期化
  const tm: TypeModel = new TypeModel();
  const logger = new Logger(vscode.window.createOutputChannel("Class Diagram Editor Log"));
  context.subscriptions.push(logger);

  // ハンドラの初期化
  const classDiagramHandler = new ClassDiagramHandler(context, tm, logger);
  const workflowDiagramHandler = new WorkflowDiagramHandler(context, logger);

  // コマンド登録
  context.subscriptions.push(
    vscode.commands.registerCommand('classDiagram.open', () => {
      classDiagramHandler.open();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('workflowDiagram.open', () => {
      workflowDiagramHandler.open();
    })
  );

  logger.info('Class Diagram Editor Extension activated.');
}

export function deactivate() {
  // クリーンアップ処理があればここに記述
}
