import { Command } from './Command';
import { DomainModel } from '../DomainModel';
import { DesignGraphAggregate } from '../DesignGraphModel';
import { HandlerResult } from '../handler-registry';
import { ClassDiagramService } from '../application/ClassDiagramService';
import { AddRelationshipInput } from '../application/dtos';
import { Relationship } from '../class-diagram-types';

export class RelationCommand extends Command {
    readonly type = 'RELATION' as const;
    readonly source: string;
    readonly target: string;
    readonly symbol: string;
    readonly multiplicity?: string;

    constructor(raw: string, source: string, target: string, symbol: string, multiplicity?: string) {
        super(raw);
        this.source = source;
        this.target = target;
        this.symbol = symbol;
        this.multiplicity = multiplicity;
    }

    execute(model: DomainModel, graph?: DesignGraphAggregate): HandlerResult {
        const relationship: Relationship = {
            id: '',
            type: this.symbol || 'dependency',
            sourceId: this.source,
            targetId: this.target,
            label: undefined,
            sourceMultiplicity: this.multiplicity,
            targetMultiplicity: undefined
        } as Relationship;
        const input: AddRelationshipInput = { relationship };
        const service = new ClassDiagramService(model);
        return service.applyAddRelationship(input);
    }
}
