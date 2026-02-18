import { Command } from './Command';
import { DomainModel } from '../DomainModel';
import { HandlerResult } from '../handler-registry';
import { TypePrefix } from '../CliParser';
import { ClassDiagramService } from '../application/ClassDiagramService';
import { AddTypeInput } from '../application/dtos';
import { ClassKind } from '../class-diagram-types';

export class AddTypeCommand extends Command {
    readonly type = 'ADD_TYPE' as const;
    readonly kind: TypePrefix;
    readonly name: string;
    readonly extends?: string[];

    constructor(raw: string, kind: TypePrefix, name: string, ext?: string[]) {
        super(raw);
        this.kind = kind;
        this.name = name;
        this.extends = ext;
    }

    execute(model: DomainModel): HandlerResult {
        const kindMap: Record<TypePrefix, ClassKind> = {
            'c': 'class', 'ac': 'class', 'i': 'interface', 's': 'struct', 'e': 'class'
        };
        const input: AddTypeInput = {
            name: this.name,
            kind: kindMap[this.kind],
            isAbstract: this.kind === 'ac',
            extendsNames: this.extends && this.extends.length ? this.extends.slice() : undefined
        };
        const service = new ClassDiagramService(model);
        return service.addTypeFromCli(input);
    }
}
