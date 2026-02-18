import { Command } from './Command';
import { DomainModel } from '../DomainModel';
import { HandlerResult } from '../handler-registry';
import { TypePrefix } from '../CliParser';
import { ClassDiagramService } from '../application/ClassDiagramService';
import { DesignGraphService } from '../application/DesignGraphService';
import { DesignGraphAggregate } from '../DesignGraphModel';
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

    execute(model: DomainModel, graph?: DesignGraphAggregate): HandlerResult {
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
        const result = service.addTypeFromCli(input);

        let nextGraph = graph;
        let graphEvents: any[] = [];
        if (graph) {
            const graphService = new DesignGraphService(graph);
            const r = graphService.addNode(input);
            nextGraph = r.graph;
            graphEvents = r.events;
        }

        return {
            ...result,
            designGraph: nextGraph,
            graphEvents
        };
    }
}
