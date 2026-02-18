// types/history-types.ts

import { ClassInfo } from './class-diagram-types';
import { Command } from './commands/Command';

/**
 * 履歴エントリ
 * コマンドと実行前の状態を保持
 */
export interface HistoryEntry {
    command: Command;         // 実行されたコマンド
    prevState: ClassInfo[];   // コマンド実行前の状態
    timestamp: number;        // 実行日時
}

/**
 * アプリケーション全体の状態
 */
export interface DiagramState {
    classes: ClassInfo[];           // 現在のクラス情報
    history: HistoryEntry[];        // Undo用の履歴スタック
    redoStack: HistoryEntry[];      // Redo用のスタック
    maxHistorySize: number;         // 履歴の最大保持数（デフォルト50）
}

/**
 * 初期状態を生成
 */
export function createInitialDiagramState(): DiagramState {
    return {
        classes: [],
        history: [],
        redoStack: [],
        maxHistorySize: 50
    };
}