import { Command } from './Command';
import { DomainModel } from '../DomainModel';
import { HandlerResult } from '../handler-registry';
import { ClassDiagramService } from '../application/ClassDiagramService';
import { AddParameterInput } from '../application/dtos';
import { createEmptyParameter } from '../class-diagram-types';

export class AddParamCommand extends Command {
    readonly type = 'ADD_PARAM' as const;
    readonly className: string;
    readonly methodName: string;
    readonly name: string;
    readonly dataType: string;

    constructor(raw: string, className: string, methodName: string, name: string, dataType: string) {
        super(raw);
        this.className = className;
        this.methodName = methodName;
        this.name = name;
        this.dataType = dataType;
    }

    execute(model: DomainModel): HandlerResult {
        const p = createEmptyParameter();
        p.name = this.name;
        p.type = this.dataType || 'string';
        const input: AddParameterInput = {
            className: this.className,
            operationName: this.methodName,
            parameter: p
        };
        const service = new ClassDiagramService(model);
        return service.applyAddParameter(input);
    }
}
