import { Command } from './Command';
import { DomainModel } from '../DomainModel';
import { DesignGraphAggregate } from '../DesignGraphModel';
import { HandlerResult } from '../handler-registry';
import { ClassDiagramService } from '../application/ClassDiagramService';
import { RenameInput } from '../application/dtos';

export class RenameCommand extends Command {
    readonly type = 'RENAME' as const;
    readonly target: 'c' | 'a' | 'm';
    readonly className: string;
    readonly oldName: string;
    readonly newName: string;

    constructor(raw: string, target: 'c' | 'a' | 'm', className: string, oldName: string, newName: string) {
        super(raw);
        this.target = target;
        this.className = className;
        this.oldName = oldName;
        this.newName = newName;
    }

    execute(model: DomainModel, graph?: DesignGraphAggregate): HandlerResult {
        const targetMap = { 'c': 'type' as const, 'a': 'member' as const, 'm': 'operation' as const };
        const input: RenameInput = {
            target: targetMap[this.target],
            className: this.className,
            oldName: this.oldName,
            newName: this.newName
        };
        const service = new ClassDiagramService(model);
        return service.applyRename(input);
    }
}
