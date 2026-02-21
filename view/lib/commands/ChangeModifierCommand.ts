import { Command } from './Command';
import { DomainModel } from '../DomainModel';
import { HandlerResult } from '../handler-registry';
import { ClassDiagramService } from '../application/ClassDiagramService';
import { ChangeModifierInput } from '../application/dtos';

export class ChangeModifierCommand extends Command {
    readonly type = 'CHANGE_MODIFIER' as const;
    readonly target: 'a' | 'm';
    readonly className: string;
    readonly memberName: string;
    readonly visibility: string | null;
    readonly modifier: string | null;
    readonly modifierSpecified: boolean;

    constructor(
        raw: string,
        target: 'a' | 'm',
        className: string,
        memberName: string,
        visibility: string | null,
        modifier: string | null,
        modifierSpecified: boolean
    ) {
        super(raw);
        this.target = target;
        this.className = className;
        this.memberName = memberName;
        this.visibility = visibility;
        this.modifier = modifier;
        this.modifierSpecified = modifierSpecified;
    }

    execute(model: DomainModel): HandlerResult {
        const input: ChangeModifierInput = {
            target: this.target === 'a' ? 'member' : 'operation',
            className: this.className,
            memberName: this.memberName,
            patch: {
                ...(this.visibility !== null && { visibility: this.visibility }),
                modifier: this.modifierSpecified ? this.modifier : undefined,
            },
        };
        const service = new ClassDiagramService(model);
        return service.applyChangeModifierFromCli(input);
    }
}
