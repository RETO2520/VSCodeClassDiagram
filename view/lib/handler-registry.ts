import { CliCommand } from "./CliParser"
import { DomainModel } from "./DomainModel"

export interface Command {
    readonly type: string
}
export interface CommandHandler<C extends CliCommand = CliCommand> {
    readonly commandType: C["type"]

    execute(command: C, model: DomainModel): DomainModel
}
export class HandlerRegistry {

    private handlers = new Map<string, CommandHandler>()

    register(handler: CommandHandler): void {
        if (this.handlers.has(handler.commandType)) {
            throw new Error(
                `Handler already registered for ${handler.commandType}`
            )
        }

        this.handlers.set(handler.commandType, handler)
    }

    dispatch(command: CliCommand, model: DomainModel): DomainModel {
        const handler = this.handlers.get(command.type)

        if (!handler) {
            throw new Error(
                `No handler registered for ${command.type}`
            )
        }

        return handler.execute(command, model)
    }
}
