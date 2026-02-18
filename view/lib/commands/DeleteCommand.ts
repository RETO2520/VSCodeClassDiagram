import { Command } from './Command';
import { DomainModel } from '../DomainModel';
import { DesignGraphAggregate } from '../DesignGraphModel';
import { HandlerResult } from '../handler-registry';
import { ClassDiagramService } from '../application/ClassDiagramService';
import { DeleteInput } from '../application/dtos';

export class DeleteCommand extends Command {
    readonly type = 'DELETE' as const;
    readonly target: 'c' | 'a' | 'm';
    readonly className: string;
    readonly name?: string;

    constructor(raw: string, target: 'c' | 'a' | 'm', className: string, name?: string) {
        super(raw);
        this.target = target;
        this.className = className;
        this.name = name;
    }

    execute(model: DomainModel, graph?: DesignGraphAggregate): HandlerResult {
        const targetMap = { 'c': 'type' as const, 'a': 'member' as const, 'm': 'operation' as const };
        const input: DeleteInput = {
            target: targetMap[this.target],
            className: this.className,
            name: this.name
        };
        const service = new ClassDiagramService(model);
        return service.applyDelete(input);
    }
}
