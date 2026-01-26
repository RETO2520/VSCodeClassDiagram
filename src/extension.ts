import * as vscode from 'vscode';
import { TypeModel } from './CodeComponents/CodeGenerator';
import { Logger } from './LoggerComponents/Logger';
import { ClassDiagramHandler } from './handlers/ClassDiagramHandler';
import { WorkflowDiagramHandler } from './handlers/WorkflowDiagramHandler';
import { LspProvider } from './services/sourceToDiagram/lsp/LspProvider';
import { SourceAnalyzer } from './services/SourceAnalyzer';
import { DiagramConverter } from './services/sourceToDiagram/converter/DiagramConverter';
import { FileService } from './services/FileService';
import { SourceToDiagramCommand } from './commands/SourceToDiagramCommand';

export function activate(context: vscode.ExtensionContext) {
  // 共通サービスの初期化
  const tm: TypeModel = new TypeModel();
  const logger = new Logger(vscode.window.createOutputChannel("Class Diagram Editor Log"));
  context.subscriptions.push(logger);
  const fileService = new FileService();

  // ハンドラの初期化
  const classDiagramHandler = new ClassDiagramHandler(context, tm, logger);
  const workflowDiagramHandler = new WorkflowDiagramHandler(context, logger);

  // Source to Diagram サービスの初期化
  const lspProvider = new LspProvider(logger);
  const analyzer = new SourceAnalyzer(lspProvider, logger);
  const converter = new DiagramConverter();
  const sourceToDiagramCommand = new SourceToDiagramCommand(analyzer, converter, fileService, logger);

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

  context.subscriptions.push(
    vscode.commands.registerCommand('sourceToDiagram.generate', () => {
      sourceToDiagramCommand.execute();
    })
  );

  logger.info('Class Diagram Editor Extension activated.');
}

export function deactivate() {
  // クリーンアップ処理があればここに記述
}
