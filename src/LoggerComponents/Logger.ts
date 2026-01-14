import * as vscode from 'vscode';

export class Logger implements vscode.Disposable {
    private channel: vscode.OutputChannel;

    constructor(channel: vscode.OutputChannel) {
        this.channel = channel;
    }

    private format(level: string, message: string) {
        return `[${new Date().toISOString()}] [${level}] ${message}`;
    }

    info(message: string) {
        this.channel.appendLine(this.format('INFO', message));
    }

    warn(message: string) {
        this.channel.appendLine(this.format('WARN', message));
    }

    error(message: string) {
        this.channel.appendLine(this.format('ERROR', message));
    }

    debug(message: string) {
        this.channel.appendLine(this.format('DEBUG', message));
    }

    show(preserveFocus = false) {
        this.channel.show(preserveFocus);
    }

    dispose() {
        this.channel.dispose();

    }
}