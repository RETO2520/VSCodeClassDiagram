import { CliCommand } from "./CliParser"
import { DomainEvent, DomainModel } from "./DomainModel"

export interface HandlerResult {
    readonly model: DomainModel
    readonly events: DomainEvent[]
}
export interface CommandHandler<C extends CliCommand = CliCommand> {
    readonly commandType: C["type"]

    execute(command: C, model: DomainModel): HandlerResult
}
export class HandlerRegistry {

    private handlers = new Map<CliCommand["type"], CommandHandler<CliCommand>>()

    register<C extends CliCommand>(handler: CommandHandler<C>): void {
        if (this.handlers.has(handler.commandType)) {
            throw new Error(
                `Handler already registered for ${handler.commandType}`
            )
        }

        this.handlers.set(handler.commandType, handler)
    }

    dispatch<C extends CliCommand>(command: C, model: DomainModel): HandlerResult {
        const handler: CommandHandler<CliCommand> | undefined = this.handlers.get(command.type)

        if (!handler) {
            throw new Error(
                `No handler registered for ${command.type}`
            )
        }

        return handler.execute(command, model)
    }
}
