import * as vscode from 'vscode';

/**
 * Context passed to message handlers
 */
export interface MessageContext {
    /** The webview panel that received the message */
    panel: vscode.WebviewPanel;
    /** Extension context for subscriptions */
    extensionContext: vscode.ExtensionContext;
    /** Additional context data specific to the handler */
    data?: Record<string, unknown>;
}

/**
 * Handler function signature for message processing
 */
export type MessageHandler = (
    message: Record<string, unknown>,
    context: MessageContext
) => Promise<void> | void;

/**
 * Options for creating a MessageRouter
 */
export interface MessageRouterOptions {
    /** The key in the message object that contains the command name (default: 'command') */
    commandKey?: string;
    /** Handler for unknown commands (optional) */
    defaultHandler?: MessageHandler;
    /** Enable error logging (default: true) */
    logErrors?: boolean;
}

/**
 * MessageRouter provides a flexible, extensible message routing system
 * that replaces switch statements with a registration-based approach.
 * 
 * @example
 * ```typescript
 * const router = new MessageRouter({ commandKey: 'command' });
 * 
 * router.register('saveJson', async (msg, ctx) => {
 *     // Handle save
 * });
 * 
 * router.register('loadJson', async (msg, ctx) => {
 *     // Handle load
 * });
 * 
 * // In webview message handler:
 * panel.webview.onDidReceiveMessage(msg => router.dispatch(msg, context));
 * ```
 */
export class MessageRouter {
    private handlers: Map<string, MessageHandler> = new Map();
    private commandKey: string;
    private defaultHandler?: MessageHandler;
    private logErrors: boolean;

    /**
     * Create a new MessageRouter
     * @param options Router configuration options
     */
    constructor(options: MessageRouterOptions = {}) {
        this.commandKey = options.commandKey ?? 'command';
        this.defaultHandler = options.defaultHandler;
        this.logErrors = options.logErrors ?? true;
    }

    /**
     * Register a handler for a specific command
     * @param command The command name to handle
     * @param handler The handler function
     * @returns this for chaining
     */
    public register(command: string, handler: MessageHandler): this {
        if (this.handlers.has(command)) {
            console.warn(`MessageRouter: Overwriting existing handler for '${command}'`);
        }
        this.handlers.set(command, handler);
        return this;
    }

    /**
     * Register multiple handlers at once
     * @param handlers Record of command names to handlers
     * @returns this for chaining
     */
    public registerAll(handlers: Record<string, MessageHandler>): this {
        for (const [command, handler] of Object.entries(handlers)) {
            this.register(command, handler);
        }
        return this;
    }

    /**
     * Unregister a handler for a specific command
     * @param command The command name to unregister
     * @returns true if handler was removed, false if not found
     */
    public unregister(command: string): boolean {
        return this.handlers.delete(command);
    }

    /**
     * Check if a handler is registered for a command
     * @param command The command name to check
     * @returns true if handler exists
     */
    public hasHandler(command: string): boolean {
        return this.handlers.has(command);
    }

    /**
     * Get list of all registered commands
     * @returns Array of registered command names
     */
    public getRegisteredCommands(): string[] {
        return Array.from(this.handlers.keys());
    }

    /**
     * Dispatch a message to the appropriate handler
     * @param message The message object from webview
     * @param context The message context
     * @returns Promise that resolves when handler completes
     */
    public async dispatch(
        message: Record<string, unknown>,
        context: MessageContext
    ): Promise<boolean> {
        const command = message[this.commandKey];

        if (typeof command !== 'string') {
            if (this.logErrors) {
                console.warn(
                    `MessageRouter: Message missing '${this.commandKey}' property or it's not a string`,
                    message
                );
            }
            return false;
        }

        const handler = this.handlers.get(command);

        if (!handler) {
            if (this.defaultHandler) {
                try {
                    await this.defaultHandler(message, context);
                    return true;
                } catch (error) {
                    this.handleError(command, error);
                    return false;
                }
            }

            if (this.logErrors) {
                console.log(`MessageRouter: No handler registered for '${command}'`);
            }
            return false;
        }

        try {
            await handler(message, context);
            return true;
        } catch (error) {
            this.handleError(command, error);
            return false;
        }
    }

    /**
     * Create a message handler function for use with webview.onDidReceiveMessage
     * @param context The message context to use
     * @returns Handler function compatible with onDidReceiveMessage
     */
    public createHandler(context: MessageContext): (message: unknown) => Promise<void> {
        return async (message: unknown) => {
            if (typeof message === 'object' && message !== null) {
                await this.dispatch(message as Record<string, unknown>, context);
            }
        };
    }

    /**
     * Handle errors from message handlers
     */
    private handleError(command: string, error: unknown): void {
        if (this.logErrors) {
            console.error(`MessageRouter: Error in handler for '${command}':`, error);
        }
    }

    /**
     * Clear all registered handlers
     */
    public clear(): void {
        this.handlers.clear();
    }
}

/**
 * Factory function to create a router for classDiagram (uses 'command' key)
 */
export function createClassDiagramRouter(options?: Omit<MessageRouterOptions, 'commandKey'>): MessageRouter {
    return new MessageRouter({ ...options, commandKey: 'command' });
}

/**
 * Factory function to create a router for workflowDiagram (uses 'type' key)
 */
export function createWorkflowRouter(options?: Omit<MessageRouterOptions, 'commandKey'>): MessageRouter {
    return new MessageRouter({ ...options, commandKey: 'type' });
}
