import { HandlerResult } from "../handler-registry";
import { DomainModel } from '../DomainModel';
import { CliCommand } from "../CliParser";
import { DomainEvent } from "../DomainModel";
import { ClassInfo, ClassMember, ClassOperation, OperationParameter } from "../class-diagram-types";


export abstract class Command {

    abstract readonly type: string;

    abstract execute(model: DomainModel): HandlerResult;
}
