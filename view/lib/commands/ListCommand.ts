import { Command } from './Command';
import { DomainModel } from '../DomainModel';
import { HandlerResult } from '../handler-registry';
import { postMessage } from '../../../frontend/src/bridge/vscode-bridge';

export class ListCommand extends Command {
    readonly type = 'LIST' as const;
    readonly subject?: 'classes' | 'commands';

    constructor(raw: string, subject?: 'classes' | 'commands') {
        super(raw);
        this.subject = subject;
    }

    execute(model: DomainModel): HandlerResult {
        if (!this.subject || this.subject === 'classes') {
            const names = model.getClasses().map(c => c.name).join(', ') || '(no classes)';
            postMessage({ command: 'showAlert', text: `Classes: ${names}` });
            return { success: true, model, events: [] };
        }
        postMessage({ command: 'showAlert', text: 'Available commands: help, sel, export, import, save, load, clear, list' });
        return { success: true, model, events: [] };
    }
}
