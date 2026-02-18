// src/cli/cli-runner.ts
import { CliParser } from "../CliParser";
import { Command } from "../commands/Command";
import { ClassDiagramService } from "../application/ClassDiagramService";

export class CliRunner {
    private parser = new CliParser();

    constructor(private readonly service: ClassDiagramService) { }

    // returns HandlerResult or throws DomainRuleViolation
    runLine(line: string) {
        const cmd = this.parser.parse(line);
        if (!cmd) return { ok: false, message: "empty or invalid command" };

        try {
            // Command subclass handles its own execution
            return cmd.execute(this.service.getModel());
        } catch (err) {
            console.error("CLI run error:", err);
            throw err;
        }
    }
}
