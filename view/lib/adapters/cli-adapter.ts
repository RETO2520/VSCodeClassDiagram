// src/adapters/cli-adapter.ts
import { Command } from '../commands/Command';
import { AddTypeCommand } from '../commands/AddTypeCommand';
import { AddAttrCommand } from '../commands/AddAttrCommand';
import { AddMethodCommand } from '../commands/AddMethodCommand';
import { AddParamCommand } from '../commands/AddParamCommand';
import { SetBaseCommand } from '../commands/SetBaseCommand';
import { SetImplCommand } from '../commands/SetImplCommand';
import { RenameCommand } from '../commands/RenameCommand';
import { DeleteCommand } from '../commands/DeleteCommand';
import { RelationCommand } from '../commands/RelationCommand';

import { createEmptyMember, createEmptyOperation, createEmptyParameter } from '../class-diagram-types';
import type {
    AddTypeInput,
    AddMemberInput,
    AddOperationInput,
    AddParameterInput,
    SetBaseInput,
    AddInterfaceImplInput,
    RenameInput,
    DeleteInput,
    AddRelationshipInput,
    HelpInput,
    SelectInput,
    ExportInput,
    GenerateCodeInput,
    ImportInput,
    SaveInput,
    LoadInput,
    ClearInput,
    ListInput,
    ChangeModifierInput,
} from '../application/dtos';
import type { Relationship } from '../class-diagram-types';

/**
 * CLI Adapter (switch-free)
 *
 * - transform Command objects into application DTOs
 * - do NOT call DomainModel here (name->id resolution is AppService job)
 * - use transformer registry: registerTransformer(type, fn)
 */

/* ---------- Basic conversion functions (kept as utilities) ---------- */

export function toAddTypeInput(cmd: AddTypeCommand): AddTypeInput {
    const kind = (cmd.kind === 'i') ? 'interface' : (cmd.kind === 's') ? 'struct' : (cmd.kind === 'ac') ? 'class' : 'class';
    const isAbstract = cmd.kind === 'ac';
    return {
        name: cmd.name,
        kind,
        isAbstract,
        extendsNames: cmd.extends && cmd.extends.length ? cmd.extends.slice() : undefined
    };
}

export function toAddAttrInput(cmd: AddAttrCommand): AddMemberInput {
    const m = createEmptyMember();
    m.name = cmd.name;
    m.type = cmd.dataType || 'string';
    m.visibility = cmd.visibility;
    m.isStatic = cmd.modifier === 'static';
    return {
        className: cmd.className,
        member: m
    };
}

export function toAddMethodInput(cmd: AddMethodCommand): AddOperationInput {
    const o = createEmptyOperation();
    o.name = cmd.name;
    o.returnType = cmd.returnType || 'void';
    o.visibility = cmd.visibility;
    o.isStatic = cmd.modifier === 'static';
    return {
        className: cmd.className,
        operation: o
    };
}

export function toAddParamInput(cmd: AddParamCommand): AddParameterInput {
    const p = createEmptyParameter();
    p.name = cmd.name;
    p.type = cmd.dataType || 'string';
    return {
        className: cmd.className,
        operationName: cmd.methodName,
        parameter: p
    };
}

export function toSetBaseInput(cmd: SetBaseCommand): SetBaseInput {
    return {
        className: cmd.className,
        baseClassName: cmd.baseClassName
    };
}

export function toSetImplInput(cmd: SetImplCommand): AddInterfaceImplInput {
    return {
        className: cmd.className,
        interfaceName: cmd.interfaceName
    };
}

export function toRenameInput(cmd: RenameCommand): RenameInput {
    const target = (cmd.target === 'c') ? 'type' : (cmd.target === 'a') ? 'member' : 'operation';
    return {
        target,
        className: cmd.className,
        oldName: cmd.oldName,
        newName: cmd.newName
    };
}

export function toDeleteInput(cmd: DeleteCommand): DeleteInput {
    const target = (cmd.target === 'c') ? 'type' : (cmd.target === 'a') ? 'member' : 'operation';
    return {
        target,
        className: cmd.className,
        name: cmd.name
    };
}

export function toRelationInput(cmd: RelationCommand): AddRelationshipInput {
    const relationship: Relationship = {
        id: '', // AppService should generate id if needed
        type: cmd.symbol || 'dependency',
        sourceId: cmd.source,
        targetId: cmd.target,
        label: undefined,
        sourceMultiplicity: cmd.multiplicity,
        targetMultiplicity: undefined
    } as Relationship;

    return { relationship };
}

/* ---------- Transformer registry (no switch) ---------- */

export type ApplicationInput =
    AddTypeInput |
    AddMemberInput |
    AddOperationInput |
    AddParameterInput |
    SetBaseInput |
    AddInterfaceImplInput |
    RenameInput |
    DeleteInput |
    AddRelationshipInput |
    HelpInput |
    SelectInput |
    ExportInput |
    GenerateCodeInput |
    ImportInput |
    SaveInput |
    LoadInput |
    ClearInput |
    ListInput |
    null;

type Transformer = (cmd: Command) => ApplicationInput | null;

const transformerRegistry = new Map<string, Transformer>();

/**
 * Register a transformer for a specific command.type (string).
 * If multiple modules want to extend the CLI, they can call this to add/override handlers.
 */
export function registerTransformer(commandType: string, transformer: Transformer): void {
    transformerRegistry.set(commandType, transformer);
}

/**
 * Unregister transformer (optional, useful for tests)
 */
export function unregisterTransformer(commandType: string): void {
    transformerRegistry.delete(commandType);
}

/**
 * Convert a Command into an application DTO using the registered transformer.
 * No switch statement here — behaviour is driven by registry entries.
 */
export function cliCommandToInput(command: Command): ApplicationInput | null {
    if (!command) return null;
    const transformer = transformerRegistry.get(command.type);
    if (!transformer) {
        // Unknown command -> null (caller should handle)
        return null;
    }
    try {
        return transformer(command);
    } catch (err) {
        // Adapter should not throw domain errors; caller can log/handle
        console.error('cliCommandToInput transformer error for', command.type, err);
        return null;
    }
}

/* ---------- Default registrations (register built-in transformers) ---------- */

registerTransformer('ADD_TYPE', (c) => toAddTypeInput(c as AddTypeCommand));
registerTransformer('ADD_ATTR', (c) => toAddAttrInput(c as AddAttrCommand));
registerTransformer('ADD_METHOD', (c) => toAddMethodInput(c as AddMethodCommand));
registerTransformer('ADD_PARAM', (c) => toAddParamInput(c as AddParamCommand));
registerTransformer('SET_BASE', (c) => toSetBaseInput(c as SetBaseCommand));
registerTransformer('SET_IMPL', (c) => toSetImplInput(c as SetImplCommand));
registerTransformer('RENAME', (c) => toRenameInput(c as RenameCommand));
registerTransformer('DELETE', (c) => toDeleteInput(c as DeleteCommand));
registerTransformer('RELATION', (c) => toRelationInput(c as RelationCommand));
// Utility commands
function toHelpInput(cmd: Command): HelpInput { return {} }
function toSelectInput(cmd: any): SelectInput { return { className: cmd.className } }
function toExportInput(cmd: any): ExportInput { return { format: (cmd as any).format, target: (cmd as any).target } }
function toImportInput(cmd: any): ImportInput { return { format: (cmd as any).format, path: (cmd as any).path } }
function toSaveInput(cmd: any): SaveInput { return { path: (cmd as any).path } }
function toLoadInput(cmd: any): LoadInput { return { path: (cmd as any).path } }
function toClearInput(cmd: Command): ClearInput { return {} }
function toListInput(cmd: any): ListInput { return { subject: (cmd as any).subject } }

function toGenerateCodeInput(cmd: any): any { return { language: (cmd as any).language, path: (cmd as any).path } }
function toChangeModifierInput(cmd: any): ChangeModifierInput {
    return {
        target: cmd.target === 'a' ? 'member' : 'operation',
        className: (cmd as any).className,
        memberName: (cmd as any).memberName,
        patch: {
            ...(cmd.visibility !== null && { visibility: cmd.visibility }),
            ...(cmd.modifierSpecified && { modifier: cmd.modifier }),
        },
    }
}

registerTransformer('HELP', (c) => toHelpInput(c));
registerTransformer('SELECT', (c) => toSelectInput(c));
registerTransformer('EXPORT', (c) => toExportInput(c));
registerTransformer('GENERATE_CODE', (c) => toGenerateCodeInput(c));
registerTransformer('IMPORT', (c) => toImportInput(c));
registerTransformer('SAVE', (c) => toSaveInput(c));
registerTransformer('LOAD', (c) => toLoadInput(c));
registerTransformer('CLEAR', (c) => toClearInput(c));
registerTransformer('LIST', (c) => toListInput(c));
registerTransformer('UNDO', (c) => null); // handled specially in command executor
registerTransformer('REDO', (c) => null); // handled specially in command executor
registerTransformer('CHANGE_MODIFIER', (c) => toChangeModifierInput(c));

/* ---------- Usage note ----------
  - To extend: import { registerTransformer } and call with new type / transformer.
  - Transformer should accept the raw Command object and return the corresponding DTO.
  - Keep adapters pure: do not mutate domain state here.
------------------------------------ */
