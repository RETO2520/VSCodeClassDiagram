import { Command } from './Command';
import { DomainModel } from '../DomainModel';
import { HandlerResult } from '../handler-registry';
import { postMessage } from '../../../frontend/src/bridge/vscode-bridge';

export class SelectCommand extends Command {
    readonly type = 'SELECT' as const;
    readonly className: string;

    constructor(raw: string, className: string) {
        super(raw);
        this.className = className;
    }

    execute(model: DomainModel): HandlerResult {
        postMessage({ command: 'log', level: 'info', text: `Select request: ${this.className}` });
        const ev = { type: 'UI_SELECT', payload: { className: this.className } };
        return { model, events: [ev] } as any;
    }
}
