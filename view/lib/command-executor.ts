// command-executor.ts (refactored)
// CLI parsing -> adapter -> ClassDiagramService execution path
// Replace previous handler-registry based executor with this file.

import { CliParser, CliCommand } from './CliParser';
import { DomainModel } from './DomainModel';
import { HandlerResult } from './handler-registry';
import { postMessage } from '../../frontend/src/bridge/vscode-bridge'; // 調整が必要ならパス変更
import { cliCommandToInput } from './adapters/cli-adapter';
import { ClassDiagramService } from './application/ClassDiagramService';

// parser はここで保持してパース専用に使う（statefulである必要はないが再利用は OK）
const parser = new CliParser();

/**
 * parseCommand - (従来と互換)
 * 文字列をパースして CliCommand を返す。パース自体は CliParserに任せる。
 */
export function parseCommand(input: string): CliCommand | null {
    return parser.parse(input);
}

/**
 * executeCommand
 * - 以前の registry.dispatch の代わりに adapter 経由で DTO を作成し、
 *   ClassDiagramService の該当メソッドを呼び出す。
 * - model を引数に取り、更新済みの model と events を返す（HandlerResult）
 */
export function executeCommand(command: CliCommand | null, model: DomainModel): HandlerResult {
    if (!command) {
        return { model, events: [] };
    }

    postMessage({ command: 'log', level: 'info', text: `Executing command: ${command.type}` });

    try {
        // 1) CLI -> normalized DTO
        const inputDto = cliCommandToInput(command);
        if (!inputDto) {
            postMessage({ command: 'log', level: 'warn', text: `No adapter transformer for command type: ${command.type}` });
            return { model, events: [] };
        }
        // 2) create a transient service with the current model as starting state
        const service = new ClassDiagramService(model /* initialModel */, undefined /* optional dispatcher */);

        // 3) route DTO to appropriate service method (duck-typing)
        // Note: keep this routing minimal; prefer adding a discriminant on DTO if you want clearer dispatch
        // The service methods return HandlerResult: { model, events }
        // Order of checks chosen for likely shapes
        // Handle utility commands explicitly by command.type
        switch (command.type) {
            case 'HELP': {
                const helpText = 'Commands: c/ac/i/s/e, a, m, p, base, impl, ren, del, sel, generate-code, import, save, load, clear, list';
                postMessage({ command: 'showAlert', text: helpText });
                return { model, events: [] };
            }
            case 'SELECT': {
                const className = (inputDto as any).className;
                postMessage({ command: 'log', level: 'info', text: `Select request: ${className}` });
                // Emit an application-level event so callers may react if they inspect events
                const ev = { type: 'UI_SELECT', payload: { className } };
                return { model, events: [ev] } as any;
            }
            case 'GENERATE_CODE': {
                const lang = (inputDto as any).language;
                const outPath = (inputDto as any).path;
                const allowed = new Set(['csharp', 'java', 'ts', 'rust', 'cpp']);
                if (!lang) {
                    postMessage({ command: 'log', level: 'warn', text: `generate-code requires a language argument` });
                    return { model, events: [] };
                }
                if (!allowed.has(lang)) {
                    postMessage({ command: 'log', level: 'warn', text: `Language not supported for generate-code: ${lang}` });
                    return { model, events: [] };
                }
                postMessage({ command: 'generateCode', payload: { model: model.getClasses(), language: lang, path: outPath } as any });
                return { model, events: [] };
            }


            case 'IMPORT': {
                // request host to load JSON (host handles file picker)
                postMessage({ command: 'loadJson' });
                return { model, events: [] };
            }
            case 'SAVE': {
                // trigger save; host will handle destination
                postMessage({ command: 'saveJson', payload: model.getClasses() as any });
                return { model, events: [] };
            }
            case 'LOAD': {
                postMessage({ command: 'loadJson' });
                return { model, events: [] };
            }
            case 'CLEAR': {
                // Replace classes with empty array
                service.replaceClassesFromArray([] as any);
                const ev = { type: 'MODEL_REPLACED', payload: { classes: [] } };
                return { model: service.getModel(), events: [ev] } as any;
            }
            case 'LIST': {
                const subject = (inputDto as any).subject;
                if (!subject || subject === 'classes') {
                    const names = model.getClasses().map(c => c.name).join(', ') || '(no classes)';
                    postMessage({ command: 'showAlert', text: `Classes: ${names}` });
                    return { model, events: [] };
                }
                // list commands - show brief help
                postMessage({ command: 'showAlert', text: 'Available commands: help, sel, export, import, save, load, clear, list' });
                return { model, events: [] };
            }
        }



        // Add Type (has name + kind)
        if ((inputDto as any).name && (inputDto as any).kind !== undefined) {
            return service.addTypeFromCli(inputDto as any);
        }

        // Add Member (has member)
        if ((inputDto as any).member) {
            // prefer CLI-specific convenience which auto-creates type if missing
            return service.addMemberFromCli(inputDto as any);
        }

        // Add Operation
        if ((inputDto as any).operation && (inputDto as any).operation.name) {
            return service.applyAddOperation(inputDto as any);
        }

        // Add Parameter
        if ((inputDto as any).parameter && (inputDto as any).operationName) {
            return service.applyAddParameter(inputDto as any);
        }

        // Set Base
        if ((inputDto as any).baseClassName !== undefined && (inputDto as any).className !== undefined) {
            // CLI semantics likely want fromCli convenience
            return service.setBaseFromCli(inputDto as any);
        }

        // Add Implemented Interface
        if ((inputDto as any).interfaceName !== undefined) {
            return service.addInterfaceImplFromCli(inputDto as any);
        }

        // Relationship
        if ((inputDto as any).relationship) {
            return service.applyAddRelationship(inputDto as any);
        }

        // Rename / Delete detection (Rename has oldName & newName)
        if ((inputDto as any).oldName && (inputDto as any).newName) {
            return service.applyRename(inputDto as any);
        }

        // Delete detection
        if ((inputDto as any).target && ((inputDto as any).name || (inputDto as any).className || (inputDto as any).classId)) {
            return service.applyDelete(inputDto as any);
        }

        // UpdateClassInput (unlikely from CLI, but guard)
        if ((inputDto as any).patch && (inputDto as any).classId) {
            return service.applyUpdateClass(inputDto as any);
        }

        // Unknown DTO shape
        postMessage({ command: 'log', level: 'warn', text: `Unhandled DTO shape for command type: ${command.type}` });
        return { model, events: [] };
    } catch (err) {
        // preserve existing behavior: log and return original model
        postMessage({ command: 'log', level: 'error', text: `Error executing command: ${String(err)}` });
        return { model, events: [] };
    }
}

/**
 * executeCommands - バッチ実行（互換）
 */
export function executeCommands(commands: CliCommand[] | null, model: DomainModel): HandlerResult {
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

export function executeAction(command: CliCommand | null, model: DomainModel): HandlerResult {
    // 常に HandlerResult を返す（互換性のため空イベントを返す）
    if (!command) return { model, events: [] };
    return executeCommand(command, model);
}