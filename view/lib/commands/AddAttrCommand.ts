import { Command } from './Command';
import { DomainModel } from '../DomainModel';
import { HandlerResult } from '../handler-registry';
import { Visibility, Modifier } from '../CliParser';
import { ClassDiagramService } from '../application/ClassDiagramService';
import { DesignGraphService } from '../application/DesignGraphService';
import { DesignGraphAggregate } from '../DesignGraphModel';
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

    execute(model: DomainModel, graph?: DesignGraphAggregate): HandlerResult {
        const m = createEmptyMember();
        m.name = this.name;
        m.type = this.dataType || 'string';
        m.visibility = this.visibility;
        m.isStatic = this.modifier === 'static';
        m.isAbstract = this.modifier === 'abstract';
        const input: AddMemberInput = {
            className: this.className,
            member: m
        };
        const service = new ClassDiagramService(model);
        const result = service.addMemberFromCli(input);

        let nextGraph = graph;
        let graphEvents: any[] = [];
        if (graph) {
            const graphService = new DesignGraphService(graph);
            const r = graphService.addMember(input);
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
