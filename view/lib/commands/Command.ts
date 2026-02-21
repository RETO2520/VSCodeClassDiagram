import { HandlerResult } from "../handler-registry";
import { DomainModel } from '../DomainModel';
import { CliCommandType } from "../CliParser";

export abstract class Command {
    abstract readonly type: CliCommandType;
    readonly raw: string;

    constructor(raw: string) {
        this.raw = raw;
    }

    abstract execute(model: DomainModel): HandlerResult;
}
