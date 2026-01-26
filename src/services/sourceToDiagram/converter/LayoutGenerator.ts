import { LayoutInfo, ClassInfo } from '../types';

/**
 * クラスの自動レイアウト情報を生成するユーティリティ
 */
export class LayoutGenerator {
    private static readonly DEFAULT_WIDTH = 400;
    private static readonly DEFAULT_HEIGHT = 120;
    private static readonly MARGIN_X = 50;
    private static readonly MARGIN_Y = 50;
    private static readonly CLASSES_PER_ROW = 4;

    /**
     * クラス情報の配列からグリッドレイアウトを生成する
     * @param classes クラス情報の配列
     * @param idMap クラス名からIDへのマップ
     * @returns レイアウト情報の配列
     */
    public static generateGridLayout(classes: ClassInfo[], idMap: Map<string, string>): LayoutInfo[] {
        const layouts: LayoutInfo[] = [];

        for (let i = 0; i < classes.length; i++) {
            const row = Math.floor(i / this.CLASSES_PER_ROW);
            const col = i % this.CLASSES_PER_ROW;

            const x = col * (this.DEFAULT_WIDTH + this.MARGIN_X) + this.MARGIN_X;
            const y = row * (this.DEFAULT_HEIGHT + this.MARGIN_Y) + this.MARGIN_Y;

            layouts.push({
                classId: idMap.get(classes[i].name) || `unknown-${i}`,
                x: x,
                y: y,
                width: this.DEFAULT_WIDTH,
                height: this.DEFAULT_HEIGHT
            });
        }

        return layouts;
    }
}
