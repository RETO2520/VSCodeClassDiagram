// src/adapters/cli-adapter.ts
import type {
    CliCommand,
    AddTypeCommand as CliAddType,
    AddAttrCommand as CliAddAttr,
    AddMethodCommand as CliAddMethod,
    AddParamCommand as CliAddParam,
    SetBaseCommand as CliSetBase,
    SetImplCommand as CliSetImpl,
    RenameCommand as CliRename,
    DeleteCommand as CliDelete,
    RelationCommand as CliRelation
} from '../CliParser';

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
    /* union type of all application inputs for return typing */
    /* If you have a common union type (e.g. ApplicationInput), import it instead */
} from '../application/dtos';
import type { Relationship } from '../class-diagram-types';

/**
 * CLI Adapter (switch-free)
 *
 * - transform raw CliCommand DTOs (from CliParser) into application DTOs
 * - do NOT call DomainModel here (name->id resolution is AppService job)
 * - use transformer registry: registerTransformer(type, fn)
 */

/* ---------- Basic conversion functions (kept similar to prior implementation) ---------- */

export function toAddTypeInput(cmd: CliAddType): AddTypeInput {
    const kind = (cmd.kind === 'i') ? 'interface' : (cmd.kind === 's') ? 'struct' : (cmd.kind === 'ac') ? 'class' : 'class';
    const isAbstract = cmd.kind === 'ac';
    return {
        name: cmd.name,
        kind,
        isAbstract,
        extendsNames: cmd.extends && cmd.extends.length ? cmd.extends.slice() : undefined
    };
}

export function toAddAttrInput(cmd: CliAddAttr): AddMemberInput {
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

export function toAddMethodInput(cmd: CliAddMethod): AddOperationInput {
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

export function toAddParamInput(cmd: CliAddParam): AddParameterInput {
    const p = createEmptyParameter();
    p.name = cmd.name;
    p.type = cmd.dataType || 'string';
    return {
        className: cmd.className,
        operationName: cmd.methodName,
        parameter: p
    };
}

export function toSetBaseInput(cmd: CliSetBase): SetBaseInput {
    return {
        className: cmd.className,
        baseClassName: cmd.baseClassName
    };
}

export function toSetImplInput(cmd: CliSetImpl): AddInterfaceImplInput {
    return {
        className: cmd.className,
        interfaceName: cmd.interfaceName
    };
}

export function toRenameInput(cmd: CliRename): RenameInput {
    const target = (cmd.target === 'c') ? 'type' : (cmd.target === 'a') ? 'member' : 'operation';
    return {
        target,
        className: cmd.className,
        oldName: cmd.oldName,
        newName: cmd.newName
    };
}

export function toDeleteInput(cmd: CliDelete): DeleteInput {
    const target = (cmd.target === 'c') ? 'type' : (cmd.target === 'a') ? 'member' : 'operation';
    return {
        target,
        className: cmd.className,
        name: cmd.name
    };
}

export function toRelationInput(cmd: CliRelation): AddRelationshipInput {
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
    null;

type Transformer = (cmd: CliCommand) => ApplicationInput | null;

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
 * Convert a CliCommand into an application DTO using the registered transformer.
 * No switch statement here — behaviour is driven by registry entries.
 */
export function cliCommandToInput(command: CliCommand): ApplicationInput | null {
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
        // You may choose to throw to fail-fast in dev
        console.error('cliCommandToInput transformer error for', command.type, err);
        return null;
    }
}

/* ---------- Default registrations (register built-in transformers) ---------- */

registerTransformer('ADD_TYPE', (c) => toAddTypeInput(c as CliAddType));
registerTransformer('ADD_ATTR', (c) => toAddAttrInput(c as CliAddAttr));
registerTransformer('ADD_METHOD', (c) => toAddMethodInput(c as CliAddMethod));
registerTransformer('ADD_PARAM', (c) => toAddParamInput(c as CliAddParam));
registerTransformer('SET_BASE', (c) => toSetBaseInput(c as CliSetBase));
registerTransformer('SET_IMPL', (c) => toSetImplInput(c as CliSetImpl));
registerTransformer('RENAME', (c) => toRenameInput(c as CliRename));
registerTransformer('DELETE', (c) => toDeleteInput(c as CliDelete));
registerTransformer('RELATION', (c) => toRelationInput(c as CliRelation));

/* ---------- Usage note ----------
  - To extend: import { registerTransformer } and call with new type / transformer.
  - Transformer should accept the raw CliCommand object and return the corresponding DTO.
  - Keep adapters pure: do not mutate domain state here.
------------------------------------ */
