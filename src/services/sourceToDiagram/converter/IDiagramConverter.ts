import { IObjectModel } from '../../../CodeComponents/CodeGenerator';
import { ClassInfo, LayoutInfo } from '../types';

/**
 * diagram.json変換機能の統一インターフェース
 * 抽出されたクラス情報（ClassInfo）を既存のdiagram.json形式（IObjectModel）に変換し、
 * 必要に応じてレイアウト情報を生成する
 */
export interface IDiagramConverter {
    /**
     * ClassInfo配列を既存のIObjectModel形式に変換する
     * @param classes 抽出されたクラス情報の配列
     * @returns 変換されたIObjectModel（diagram.jsonのルート構造）
     */
    convert(classes: ClassInfo[]): IObjectModel;

    /**
     * クラス情報の配列から自動レイアウト情報を生成する
     * @param classes 抽出されたクラス情報の配列
     * @returns 各クラスのレイアウト情報（位置とサイズ）の配列
     */
    generateLayout(classes: ClassInfo[]): LayoutInfo[];
}
