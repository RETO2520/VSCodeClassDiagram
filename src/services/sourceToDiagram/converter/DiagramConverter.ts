import { IDiagramConverter } from './IDiagramConverter';
import { IObjectModel, IClassModel, IAttributeModel, IOperationModel, IParameterModel } from '../../../CodeComponents/CodeGenerator';
import { ClassInfo, LayoutInfo, AttributeInfo, OperationInfo, ParameterInfo } from '../types';
import { IdGenerator } from './IdGenerator';
import { LayoutGenerator } from './LayoutGenerator';

/**
 * 抽出された情報をdiagram.json形式に変換するクラスの実装
 */
export class DiagramConverter implements IDiagramConverter {
    /**
     * クラス情報の配列をIObjectModelに変換する
     */
    public convert(classes: ClassInfo[]): IObjectModel {
        const idMap = new Map<string, string>();

        // まずIDマップを作成（基底クラスやインターフェースの参照に使用）
        for (const cls of classes) {
            const id = IdGenerator.generateClassId(cls.name, cls.location.uri);
            idMap.set(cls.name, id);
        }

        const layouts = LayoutGenerator.generateGridLayout(classes, idMap);
        const layoutMap = new Map<string, LayoutInfo>();
        for (const l of layouts) {
            layoutMap.set(l.classId, l);
        }

        const classModels: IClassModel[] = classes.map(cls => this.convertToClassModel(cls, idMap, layoutMap));

        return {
            classes: classModels
        };
    }

    /**
     * レイアウト情報のみを生成する
     */
    public generateLayout(classes: ClassInfo[]): LayoutInfo[] {
        const idMap = new Map<string, string>();
        for (const cls of classes) {
            const id = IdGenerator.generateClassId(cls.name, cls.location.uri);
            idMap.set(cls.name, id);
        }
        return LayoutGenerator.generateGridLayout(classes, idMap);
    }

    private convertToClassModel(cls: ClassInfo, idMap: Map<string, string>, layoutMap: Map<string, LayoutInfo>): IClassModel {
        const id = idMap.get(cls.name)!;
        const layout = layoutMap.get(id)!;

        return {
            id: id,
            name: cls.name,
            x: layout.x,
            y: layout.y,
            width: layout.width,
            height: layout.height,
            baseClass: cls.baseClass || '',
            baseClassId: cls.baseClass ? (idMap.get(cls.baseClass) || '') : '',
            interfaces: cls.interfaces,
            isAbstract: cls.kind === 'abstract',
            isInterface: cls.kind === 'interface',
            isStruct: cls.kind === 'struct',
            attributes: cls.attributes.map(attr => this.convertToAttributeModel(attr)),
            operations: cls.operations.map(op => this.convertToOperationModel(op))
        };
    }

    private convertToAttributeModel(attr: AttributeInfo): IAttributeModel {
        return {
            name: attr.name,
            type: attr.type,
            visibility: attr.visibility,
            modifier: attr.modifiers.join(' ')
        };
    }

    private convertToOperationModel(op: OperationInfo): IOperationModel {
        return {
            name: op.name,
            returnType: op.returnType,
            visibility: op.visibility,
            modifier: op.modifiers.join(' '),
            parameters: op.parameters.map(p => this.convertToParameterModel(p))
        };
    }

    private convertToParameterModel(param: ParameterInfo): IParameterModel {
        return {
            name: param.name,
            type: param.type
        };
    }
}
