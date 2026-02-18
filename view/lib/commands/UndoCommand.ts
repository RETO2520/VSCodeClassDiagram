import { Command } from './Command';
import { DomainModel } from '../DomainModel';
import { DesignGraphAggregate } from '../DesignGraphModel';
import { HandlerResult } from '../handler-registry';
import { ClassDiagramService } from '../application/ClassDiagramService';

export class UndoCommand extends Command {
    readonly type = 'UNDO' as const;

    constructor(raw: string) {
        super(raw);
    }

    execute(model: DomainModel, graph?: DesignGraphAggregate): HandlerResult {
        const service = new ClassDiagramService(model);
        const ev = { type: 'MODEL_UNDO' };
        return { model: service.getModel(), events: [ev] } as any;
    }
}
