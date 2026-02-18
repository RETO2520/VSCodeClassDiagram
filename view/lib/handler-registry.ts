import { Command } from "./commands/Command"
import { DomainEvent, DomainModel } from "./DomainModel"

export interface HandlerResult {
    readonly model: DomainModel
    readonly events: DomainEvent[]
}
export interface CommandHandler<C extends Command = Command> {
    readonly commandType: C["type"]

    execute(command: C, model: DomainModel): HandlerResult
}
export class HandlerRegistry {

    private handlers = new Map<string, CommandHandler<Command>>()

    register<C extends Command>(handler: CommandHandler<C>): void {
        if (this.handlers.has(handler.commandType)) {
            throw new Error(
                `Handler already registered for ${handler.commandType}`
            )
        }

        this.handlers.set(handler.commandType, handler)
    }

    dispatch<C extends Command>(command: C, model: DomainModel): HandlerResult {
        const handler: CommandHandler<Command> | undefined = this.handlers.get(command.type)

        if (!handler) {
            throw new Error(
                `No handler registered for ${command.type}`
            )
        }

        return handler.execute(command, model)
    }
}
