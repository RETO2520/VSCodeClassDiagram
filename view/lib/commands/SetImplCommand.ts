import { Command } from './Command';
import { DomainModel } from '../DomainModel';
import { HandlerResult } from '../handler-registry';
import { ClassDiagramService } from '../application/ClassDiagramService';
import { AddInterfaceImplInput } from '../application/dtos';

export class SetImplCommand extends Command {
    readonly type = 'SET_IMPL' as const;
    readonly className: string;
    readonly interfaceName: string;

    constructor(raw: string, className: string, interfaceName: string) {
        super(raw);
        this.className = className;
        this.interfaceName = interfaceName;
    }

    execute(model: DomainModel): HandlerResult {
        const input: AddInterfaceImplInput = {
            className: this.className,
            interfaceName: this.interfaceName
        };
        const service = new ClassDiagramService(model);
        return service.addInterfaceImplFromCli(input);
    }
}
