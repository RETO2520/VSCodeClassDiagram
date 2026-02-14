import { ClassInfo, ClassKind, Visibility as UmlVisibility, createEmptyClass, createEmptyMember, createEmptyOperation, createEmptyParameter } from './class-diagram-types';
import { CliParser, CliCommand, AddTypeCommand, AddAttrCommand, AddMethodCommand, AddParamCommand, SetBaseCommand, SetImplCommand, RenameCommand, DeleteCommand } from './CliParser';

const parser = new CliParser();

export function parseCommand(input: string): CliCommand | null {
    return parser.parse(input);
}

function mapVisibility(v: string): UmlVisibility {
    switch (v) {
        case 'private': return 'private';
        case 'protected': return 'protected';
        case 'package': return 'package';
        default: return 'public';
    }
}

/**
 * Ensures a class exists in the state, creating it if necessary.
 * Returns the class.
 */
function getOrCreateClass(classes: ClassInfo[], name: string, preferredKind: ClassKind = 'class'): { updatedClasses: ClassInfo[], target: ClassInfo } {
    let target = classes.find(c => c.name === name);
    if (target) {
        return { updatedClasses: classes, target };
    }

    // Create new class
    const newClass = createEmptyClass();
    newClass.name = name;
    newClass.kind = preferredKind;
    if (preferredKind === 'interface') {
        newClass.isAbstract = false; // interfaces are interfaces
    }

    return {
        updatedClasses: [...classes, newClass],
        target: newClass
    };
}

export function executeAction(
    command: CliCommand,
    setClasses: (updater: (prev: ClassInfo[]) => ClassInfo[]) => void
) {
    if (!command) return;

    switch (command.type) {
        case 'ADD_TYPE': {
            const addType = command as AddTypeCommand;
            setClasses(prev => {
                let currentClasses = [...prev];

                // 1. Create the main class
                const { updatedClasses: classesWithMain, target: newClass } = getOrCreateClass(currentClasses, addType.name);
                currentClasses = classesWithMain;

                // Update properties if it was just created or already existed
                newClass.kind = (addType.kind === 'i' ? 'interface' : addType.kind === 's' ? 'struct' : 'class') as ClassKind;
                newClass.isAbstract = (addType.kind === 'ac');

                // 2. Handle extends list (e.g., : User, IAuth)
                // If extends property is present (even if empty, e.g. "c A :"), we overwrite.
                if (addType.extends !== undefined) {
                    newClass.baseClassId = null;
                    newClass.interfaces = [];

                    if (addType.extends.length > 0) {
                        addType.extends.forEach((parentName, index) => {
                            let preferredKind: ClassKind = 'class';
                            if (addType.kind === 'i' || index > 0 || parentName.match(/^I[A-Z]/)) {
                                preferredKind = 'interface';
                            }

                            const { updatedClasses: nextClasses, target: parent } = getOrCreateClass(currentClasses, parentName, preferredKind);
                            currentClasses = nextClasses;

                            // Link based on parent kind
                            if (parent.kind === 'interface') {
                                if (!newClass.interfaces.includes(parent.id)) {
                                    newClass.interfaces = [...newClass.interfaces, parent.id];
                                }
                            } else {
                                if (!newClass.baseClassId) {
                                    newClass.baseClassId = parent.id;
                                }
                            }
                        });
                    }
                }

                // Return updated list ensuring newClass is updated in the list
                return currentClasses.map(c => c.name === newClass.name ? newClass : c);
            });
            break;
        }
        case 'ADD_ATTR': {
            const addAttr = command as AddAttrCommand;
            setClasses(prev => prev.map(c => {
                if (c.name === addAttr.className) {
                    const newAttr = createEmptyMember();
                    newAttr.name = addAttr.name;
                    newAttr.type = addAttr.dataType || 'string';
                    newAttr.visibility = mapVisibility(addAttr.visibility);
                    newAttr.isStatic = addAttr.modifier === 'static';
                    return { ...c, members: [...c.members, newAttr] };
                }
                return c;
            }));
            break;
        }
        case 'ADD_METHOD': {
            const addMethod = command as AddMethodCommand;
            setClasses(prev => prev.map(c => {
                if (c.name === addMethod.className) {
                    const newOp = createEmptyOperation();
                    newOp.name = addMethod.name;
                    newOp.returnType = addMethod.returnType || 'void';
                    newOp.visibility = mapVisibility(addMethod.visibility);
                    newOp.isStatic = addMethod.modifier === 'static';
                    return { ...c, operations: [...c.operations, newOp] };
                }
                return c;
            }));
            break;
        }
        case 'ADD_PARAM': {
            const addParam = command as AddParamCommand;
            setClasses(prev => prev.map(c => {
                if (c.name === addParam.className) {
                    return {
                        ...c,
                        operations: c.operations.map(op => {
                            if (op.name === addParam.methodName) {
                                const newParam = createEmptyParameter();
                                newParam.name = addParam.name;
                                newParam.type = addParam.dataType || 'string';
                                return { ...op, parameters: [...op.parameters, newParam] };
                            }
                            return op;
                        })
                    };
                }
                return c;
            }));
            break;
        }
        case 'SET_BASE': {
            const setBase = command as SetBaseCommand;
            setClasses(prev => {
                let currentClasses = [...prev];

                // Ensure target exists
                const { updatedClasses: afterTarget, target: cls } = getOrCreateClass(currentClasses, setBase.className);
                currentClasses = afterTarget;

                // Ensure parent exists
                const { updatedClasses: afterParent, target: parent } = getOrCreateClass(currentClasses, setBase.baseClassName, 'class');
                currentClasses = afterParent;

                return currentClasses.map(c => c.name === cls.name ? { ...c, baseClassId: parent.id } : c);
            });
            break;
        }
        case 'SET_IMPL': {
            const setImpl = command as SetImplCommand;
            setClasses(prev => {
                let currentClasses = [...prev];

                // Ensure target exists
                const { updatedClasses: afterTarget, target: cls } = getOrCreateClass(currentClasses, setImpl.className);
                currentClasses = afterTarget;

                // Ensure interface exists
                const { updatedClasses: afterIface, target: iface } = getOrCreateClass(currentClasses, setImpl.interfaceName, 'interface');
                currentClasses = afterIface;

                return currentClasses.map(c => {
                    if (c.name === cls.name && !c.interfaces.includes(iface.id)) {
                        return { ...c, interfaces: [...c.interfaces, iface.id] };
                    }
                    return c;
                });
            });
            break;
        }
        case 'RENAME': {
            const rename = command as RenameCommand;
            setClasses(prev => prev.map(c => {
                if (rename.target === 'c' && c.name === rename.oldName) return { ...c, name: rename.newName };
                if (c.name === rename.className) {
                    if (rename.target === 'a') {
                        return { ...c, members: c.members.map(m => m.name === rename.oldName ? { ...m, name: rename.newName } : m) };
                    }
                    if (rename.target === 'm') {
                        return { ...c, operations: c.operations.map(o => o.name === rename.oldName ? { ...o, name: rename.newName } : o) };
                    }
                }
                return c;
            }));
            break;
        }
        case 'DELETE': {
            const del = command as DeleteCommand;
            setClasses(prev => {
                if (del.target === 'c') return prev.filter(c => c.name !== del.className);
                return prev.map(c => {
                    if (c.name === del.className) {
                        if (del.target === 'a') return { ...c, members: c.members.filter(m => m.name !== del.name) };
                        if (del.target === 'm') return { ...c, operations: c.operations.filter(o => o.name !== del.name) };
                    }
                    return c;
                });
            });
            break;
        }
        case 'RELATION': {
            break;
        }
    }
}
