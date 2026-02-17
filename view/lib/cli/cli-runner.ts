// src/cli/cli-runner.ts
import { CliParser } from "../CliParser";
import { cliCommandToInput } from "../adapters/cli-adapter";
import { ClassDiagramService } from "../application/ClassDiagramService";
import type { AddTypeInput, AddMemberInput } from "../application/dtos";

export class CliRunner {
    private parser = new CliParser();

    constructor(private readonly service: ClassDiagramService) { }

    // returns HandlerResult or throws DomainRuleViolation
    runLine(line: string) {
        const cmd = this.parser.parse(line);
        if (!cmd) return { ok: false, message: "empty or invalid command" };

        const input = cliCommandToInput(cmd as any);
        if (!input) {
            return { ok: false, message: `unsupported command: ${cmd.type}` };
        }

        // dispatch by presence of properties (duck-typing) — lightweight routing without switch
        // Prefer to inspect 'type' field on the input DTO if you added it; otherwise detect shape.
        // Here we use explicit 'in' checks or typeof checks.
        try {
            // Example dispatch map (expand as needed)
            if ((input as AddTypeInput).name && (input as any).kind !== undefined) {
                // AddTypeInput shape
                return this.service.addTypeFromCli(input as AddTypeInput);
            }

            if ((input as AddMemberInput).member) {
                return this.service.addMemberFromCli(input as AddMemberInput);
            }

            // relationship
            if ((input as any).relationship) {
                return this.service.applyAddRelationship(input as any);
            }

            // generic: try to detect rename/delete
            if ((input as any).target === 'type' || (input as any).target === 'member' || (input as any).target === 'operation') {
                if ((input as any).oldName && (input as any).newName) {
                    return this.service.applyRename(input as any);
                } else {
                    return this.service.applyDelete(input as any);
                }
            }

            // fallback: if the DTO includes a discriminant 'dtoType' field you can switch on that.
            return { ok: false, message: "no handler found for input" };
        } catch (err) {
            console.error("CLI run error:", err);
            throw err;
        }
    }
}
