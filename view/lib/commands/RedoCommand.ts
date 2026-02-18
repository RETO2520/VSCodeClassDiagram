import { Command } from './Command';
import { DomainModel } from '../DomainModel';
import { HandlerResult } from '../handler-registry';
import { ClassDiagramService } from '../application/ClassDiagramService';

export class RedoCommand extends Command {
    readonly type = 'REDO' as const;

    constructor(raw: string) {
        super(raw);
    }

    execute(model: DomainModel): HandlerResult {
        const service = new ClassDiagramService(model);
        const ev = { type: 'MODEL_REDO' };
        return { model: service.getModel(), events: [ev] } as any;
    }
}
