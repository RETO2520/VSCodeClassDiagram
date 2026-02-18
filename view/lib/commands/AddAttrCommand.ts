import { Command } from './Command';
import { DomainModel } from '../DomainModel';
import { HandlerResult } from '../handler-registry';
import { Visibility, Modifier } from '../CliParser';
import { ClassDiagramService } from '../application/ClassDiagramService';
import { AddMemberInput } from '../application/dtos';
import { createEmptyMember } from '../class-diagram-types';

export class AddAttrCommand extends Command {
    readonly type = 'ADD_ATTR' as const;
    readonly className: string;
    readonly visibility: Visibility;
    readonly modifier?: Modifier;
    readonly name: string;
    readonly dataType: string;

    constructor(raw: string, className: string, visibility: Visibility, name: string, dataType: string, modifier?: Modifier) {
        super(raw);
        this.className = className;
        this.visibility = visibility;
        this.name = name;
        this.dataType = dataType;
        this.modifier = modifier;
    }

    execute(model: DomainModel): HandlerResult {
        const m = createEmptyMember();
        m.name = this.name;
        m.type = this.dataType || 'string';
        m.visibility = this.visibility;
        m.isStatic = this.modifier === 'static';
        const input: AddMemberInput = {
            className: this.className,
            member: m
        };
        const service = new ClassDiagramService(model);
        return service.addMemberFromCli(input);
    }
}
