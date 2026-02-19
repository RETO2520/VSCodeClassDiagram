// src/application/dtos.ts
import type {
    ClassInfo,
    ClassMember,
    ClassOperation,
    OperationParameter,
    Relationship,
    ClassKind
} from '../class-diagram-types';

/**
 * Lightweight DTOs used by ApplicationService.
 * Keep them UI-agnostic and domain-friendly.
 */

export type IdOrName = { id?: string; name?: string }

/* ---------- Type (class) ---------- */
export interface AddTypeInput {
    name: string;
    kind: ClassKind;
    isAbstract?: boolean;
    extendsNames?: string[]; // CLI may supply names; AppService resolves to IDs or creates classes
}

export interface RemoveTypeInput {
    id?: string;
    name?: string;
}

export interface UpdateTypeInput {
    id?: string;
    name?: string;
    patch: Partial<Omit<ClassInfo, 'id'>>;
}

/* ---------- Member ---------- */
export interface AddMemberInput {
    classId?: string;
    className?: string;
    member: ClassMember;
}
export interface RemoveMemberInput {
    classId?: string;
    className?: string;
    memberName: string;
}
export interface UpdateMemberInput {
    classId?: string;
    className?: string;
    memberName: string;
    updater: (m: ClassMember) => ClassMember;
}

/* ---------- Operation ---------- */
export interface AddOperationInput {
    classId?: string;
    className?: string;
    operation: ClassOperation;
}
export interface RemoveOperationInput {
    classId?: string;
    className?: string;
    operationName: string;
}
export interface UpdateOperationInput {
    classId?: string;
    className?: string;
    operationName: string;
    updater: (op: ClassOperation) => ClassOperation;
}

/* ---------- Parameter ---------- */
export interface AddParameterInput {
    classId?: string;
    className?: string;
    operationName: string;
    parameter: OperationParameter;
}

export interface ChangeModifierInput {
    target: 'member' | 'operation';
    classId?: string;
    className: string;
    memberName: string;
    patch: {
        visibility?: string; // '+' | '-' | '#' | '~' | null
        modifier: string | null | undefined; // 's' | 'a' | 'v' | null
    };

}

/* ---------- Inheritance / Interface ---------- */
export interface SetBaseInput {
    classId?: string;
    className?: string;
    baseClassId?: string | null;
    baseClassName?: string | null;
}
export interface AddInterfaceImplInput {
    classId?: string;
    className?: string;
    interfaceId?: string;
    interfaceName?: string;
}

/* ---------- Relationship ---------- */
export interface AddRelationshipInput {
    relationship: Relationship;
}
export interface RemoveRelationshipInput {
    relationshipId: string;
}

/* ---------- Rename / Delete generic ---------- */
export interface RenameInput {
    target: 'type' | 'member' | 'operation';
    classId?: string;
    className?: string;
    oldName: string;
    newName: string;
}
export interface DeleteInput {
    target: 'type' | 'member' | 'operation';
    classId?: string;
    className?: string;
    name?: string;
}

/* ---------- Full-class GUI update (patch) ---------- */
export interface UpdateClassInput {
    classId: string;
    patch: Partial<ClassInfo>;
}

/* ---------- Utility / UI / Persistence commands ---------- */
export interface HelpInput {
    /** no payload needed */
}

export interface SelectInput {
    className: string;
}

export interface ExportInput {
    format?: string; // json | svg | png | plantuml
    target?: string; // optional class name
}

export interface GenerateCodeInput {
    language: 'csharp' | 'java' | 'ts' | 'rust' | 'cpp';
    path?: string;
}

export interface ImportInput {
    format: string;
    path: string;
}

export interface SaveInput {
    path?: string;
}

export interface LoadInput {
    path: string;
}

export interface ClearInput {
}

export interface ListInput {
    subject?: 'classes' | 'commands';
}

export interface ApplyFactoryPatternInput {
    factoryName: string;
    abstractName: string;
    concreteNames: string[];
}

