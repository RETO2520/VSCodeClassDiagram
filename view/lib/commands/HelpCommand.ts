import { Command } from './Command';
import { DomainModel } from '../DomainModel';
import { DesignGraphAggregate } from '../DesignGraphModel';
import { HandlerResult } from '../handler-registry';
import { postMessage } from '../../../frontend/src/bridge/vscode-bridge';

export class HelpCommand extends Command {
    readonly type = 'HELP' as const;

    constructor(raw: string) {
        super(raw);
    }

    execute(model: DomainModel, graph?: DesignGraphAggregate): HandlerResult {
        const helpText = 'Commands: c/ac/i/s/e, a, m, p, base, impl, ren, del, sel, generate-code, import, save, load, clear, list';
        postMessage({ command: 'showAlert', text: helpText });
        return { model, events: [] };
    }
}
