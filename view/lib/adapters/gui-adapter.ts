// src/adapters/gui-adapter.ts
import type { ClassInfo } from '../class-diagram-types';
import type { UpdateClassInput, AddMemberInput, AddOperationInput, AddParameterInput } from '../application/dtos';
import { createEmptyMember, createEmptyOperation, createEmptyParameter } from '../class-diagram-types';

/**
 * GUI Adapter
 * - compute patch between two ClassInfo and return UpdateClassInput
 * - convert GUI direct edits into AddMemberInput / AddOperationInput if desired
 *
 * Note: "before" should be the canonical ClassInfo from the model, "after" the edited one.
 */

/* Simple shallow patch: for primitive/array/object fields, if JSON differs we include the whole field.
   This is intentionally conservative (send changed properties only). */
export function toUpdateClassInput(before: ClassInfo, after: ClassInfo): UpdateClassInput {
    const patch: Partial<ClassInfo> = {};

    if (before.name !== after.name) patch.name = after.name;
    if (before.kind !== after.kind) patch.kind = after.kind;
    if (!!before.isAbstract !== !!after.isAbstract) patch.isAbstract = after.isAbstract;
    if (before.baseClassId !== after.baseClassId) patch.baseClassId = after.baseClassId;
    // interfaces (array)
    if (JSON.stringify(before.interfaces) !== JSON.stringify(after.interfaces)) patch.interfaces = [...after.interfaces];
    // members and operations - if changed, send full arrays
    if (JSON.stringify(before.members) !== JSON.stringify(after.members)) patch.members = after.members.map(m => ({ ...m }));
    if (JSON.stringify(before.operations) !== JSON.stringify(after.operations)) patch.operations = after.operations.map(o => ({ ...o, parameters: o.parameters.map(p => ({ ...p })) }));

    return {
        classId: before.id,
        patch
    };
}

/* Convenience GUI->DTO helpers (when user clicks "Add attribute" etc.) */
export function toAddMemberInputGui(classId: string): AddMemberInput {
    return {
        classId,
        member: createEmptyMember()
    };
}

export function toAddOperationInputGui(classId: string): AddOperationInput {
    return {
        classId,
        operation: createEmptyOperation()
    };
}

export function toAddParameterInputGui(classId: string, operationName: string): AddParameterInput {
    return {
        classId,
        operationName,
        parameter: createEmptyParameter()
    };
}
