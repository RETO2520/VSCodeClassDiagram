// command-executor.ts (refactored)
// CLI parsing -> Command.execute() execution path
// Each Command subclass encapsulates its own execution logic.

import { CliParser } from './CliParser';
import { Command } from './commands/Command';
import { DomainModel } from './DomainModel';
import { HandlerResult } from './handler-registry';
import { postMessage } from '../../frontend/src/bridge/vscode-bridge';

// parser はここで保持してパース専用に使う
const parser = new CliParser();

/**
 * parseCommand - 文字列をパースして Command を返す。
 */
export function parseCommand(input: string): Command | null {
    return parser.parse(input);
}

/**
 * executeCommand
 * - Command.execute() に委譲するだけのシンプルな関数
 */
export function executeCommand(command: Command | null, model: DomainModel): HandlerResult {
    if (!command) {
        return { model, events: [] };
    }

    postMessage({ command: 'log', level: 'info', text: `Executing command: ${command.type}` });

    try {
        return command.execute(model);
    } catch (err) {
        postMessage({ command: 'log', level: 'error', text: `Error executing command: ${String(err)}` });
        return { model, events: [] };
    }
}

/**
 * executeCommands - バッチ実行（互換）
 */
export function executeCommands(commands: Command[] | null, model: DomainModel): HandlerResult {
    if (!commands || commands.length === 0) return { model, events: [] };

    let currentModel = model;
    let currentEvents: any[] = [];

    for (const cmd of commands) {
        const result = executeCommand(cmd, currentModel);
        currentModel = result.model;
        if (result.events && result.events.length) currentEvents = currentEvents.concat(result.events);
    }

    return { model: currentModel, events: currentEvents };
}

export function executeAction(command: Command | null, model: DomainModel): HandlerResult {
    // 常に HandlerResult を返す（互換性のため空イベントを返す）
    if (!command) return { model, events: [] };
    return executeCommand(command, model);
}