import { Command } from './Command';
import { DomainModel } from '../DomainModel';
import { HandlerResult } from '../handler-registry';
import { Visibility, Modifier } from '../CliParser';
import { ClassDiagramService } from '../application/ClassDiagramService';
import { AddOperationInput } from '../application/dtos';
import { createEmptyOperation } from '../class-diagram-types';

export class AddMethodCommand extends Command {
    readonly type = 'ADD_METHOD' as const;
    readonly className: string;
    readonly visibility: Visibility;
    readonly modifier?: Modifier;
    readonly name: string;
    readonly returnType: string;

    constructor(raw: string, className: string, visibility: Visibility, name: string, returnType: string, modifier?: Modifier) {
        super(raw);
        this.className = className;
        this.visibility = visibility;
        this.name = name;
        this.returnType = returnType;
        this.modifier = modifier;
    }

    execute(model: DomainModel): HandlerResult {
        const o = createEmptyOperation();
        o.name = this.name;
        o.returnType = this.returnType || 'void';
        o.visibility = this.visibility;
        o.isStatic = this.modifier === 'static';
        const input: AddOperationInput = {
            className: this.className,
            operation: o
        };
        const service = new ClassDiagramService(model);
        return service.applyAddOperation(input);
    }
}
