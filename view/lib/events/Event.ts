import { BaseDomainEvent } from '../DomainModel'
import { ClassInfo, ClassMember, ClassOperation, OperationParameter, Relationship } from '../class-diagram-types'

export class TypeAddedEvent extends BaseDomainEvent {

    readonly type = 'TYPE_ADDED'
    readonly payload: any
    constructor(
        public readonly className: string,
        public readonly classInfo: ClassInfo
    ) {
        super()
    }
}

export class TypeRemovedEvent extends BaseDomainEvent {

    readonly type = 'TYPE_REMOVED'
    readonly payload: any
    constructor(
        public readonly className: string
    ) {
        super()
    }
}

export class TypeUpdatedEvent extends BaseDomainEvent {

    readonly type = 'TYPE_UPDATED'
    readonly payload: any
    constructor(
        public readonly className: string,
        public readonly classInfo: ClassInfo
    ) {
        super()
    }
}

export class MemberAddedEvent extends BaseDomainEvent {

    readonly type = 'MEMBER_ADDED'
    readonly payload: any
    constructor(
        public readonly className: string,
        public readonly member: ClassMember
    ) {
        super()
    }
}

export class MemberRemovedEvent extends BaseDomainEvent {

    readonly type = 'MEMBER_REMOVED'
    readonly payload: any
    constructor(
        public readonly className: string,
        public readonly member: ClassMember
    ) {
        super()
    }
}

export class MemberUpdatedEvent extends BaseDomainEvent {

    readonly type = 'MEMBER_UPDATED'
    readonly payload: any
    constructor(
        public readonly className: string,
        public readonly member: ClassMember,
        public readonly oldName: string,
        public readonly newName: string
    ) {
        super()
        this.payload = {
            className,
            member,
            oldName,
            newName
        }
    }

}

export class OperationAddedEvent extends BaseDomainEvent {

    readonly type = 'OPERATION_ADDED'
    readonly payload: any
    constructor(
        public readonly className: string,
        public readonly operation: ClassOperation
    ) {
        super()
    }
}

export class OperationRemovedEvent extends BaseDomainEvent {

    readonly type = 'OPERATION_REMOVED'
    readonly payload: any
    constructor(
        public readonly className: string,
        public readonly operation: ClassOperation
    ) {
        super()
    }
}

export class OperationUpdatedEvent extends BaseDomainEvent {

    readonly type = 'OPERATION_UPDATED'
    readonly payload: any
    constructor(
        public readonly className: string,
        public readonly operation: ClassOperation,
        public readonly oldName: string,
        public readonly newName: string
    ) {
        super()
    }
}

export class ParameterAddedEvent extends BaseDomainEvent {

    readonly type = 'PARAMETER_ADDED'
    readonly payload: any
    constructor(
        public readonly className: string,
        public readonly operationName: string,
        public readonly parameter: OperationParameter
    ) {
        super()
    }
}

export class ParameterRemovedEvent extends BaseDomainEvent {

    readonly type = 'PARAMETER_REMOVED'
    readonly payload: any
    constructor(
        public readonly className: string,
        public readonly operationName: string,
        public readonly parameter: OperationParameter
    ) {
        super()
    }
}

export class ParameterUpdatedEvent extends BaseDomainEvent {

    readonly type = 'PARAMETER_UPDATED'
    readonly payload: any
    constructor(
        public readonly className: string,
        public readonly operationName: string,
        public readonly parameter: OperationParameter
    ) {
        super()
    }
}

export class BaseClassAddedEvent extends BaseDomainEvent {

    readonly type = 'BASE_CLASS_ADDED'
    readonly payload: any
    constructor(
        public readonly className: string,
        public readonly baseClassName: string
    ) {
        super()
    }
}

export class BaseClassRemovedEvent extends BaseDomainEvent {

    readonly type = 'BASE_CLASS_REMOVED'
    readonly payload: any
    constructor(
        public readonly className: string,
        public readonly baseClassName: string
    ) {
        super()
    }
}

export class BaseClassUpdatedEvent extends BaseDomainEvent {

    readonly type = 'BASE_CLASS_UPDATED'
    readonly payload: any
    constructor(
        public readonly className: string,
        public readonly baseClassName: string
    ) {
        super()
    }
}

export class ImplementedInterfaceAddedEvent extends BaseDomainEvent {

    readonly type = 'IMPLEMENTED_INTERFACE_ADDED'
    readonly payload: any
    constructor(
        public readonly className: string,
        public readonly interfaceName: string
    ) {
        super()
    }
}

export class ImplementedInterfaceRemovedEvent extends BaseDomainEvent {

    readonly type = 'IMPLEMENTED_INTERFACE_REMOVED'
    readonly payload: any
    constructor(
        public readonly className: string,
        public readonly interfaceName: string
    ) {
        super()
    }
}

export class ImplementedInterfaceUpdatedEvent extends BaseDomainEvent {

    readonly type = 'IMPLEMENTED_INTERFACE_UPDATED'
    readonly payload: any
    constructor(
        public readonly className: string,
        public readonly interfaceName: string
    ) {
        super()
    }
}

export class RelationshipAddedEvent extends BaseDomainEvent {

    readonly type = 'RELATIONSHIP_ADDED'
    readonly payload: any
    constructor(
        public readonly relationship: Relationship
    ) {
        super()
    }
}

export class RelationshipRemovedEvent extends BaseDomainEvent {

    readonly type = 'RELATIONSHIP_REMOVED'
    readonly payload: any
    constructor(
        public readonly relationship: Relationship
    ) {
        super()
    }
}

export class RelationshipUpdatedEvent extends BaseDomainEvent {

    readonly type = 'RELATIONSHIP_UPDATED'
    readonly payload: any
    constructor(
        public readonly relationship: Relationship
    ) {
        super()
    }
}
