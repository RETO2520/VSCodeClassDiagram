/**
 * ActivitySidebar
 * VSCode風の左端アイコンサイドバー。
 * クラス図エディタ / ワークフロー図エディタを切り替える。
 */

import React from 'react'
import { LayoutGrid, GitBranch } from 'lucide-react'

export type EditorMode = 'class-diagram' | 'workflow'

interface ActivitySidebarProps {
    mode: EditorMode
    onModeChange: (mode: EditorMode) => void
    /** ワークフロー図で現在開いているメソッド名（バッジ表示用） */
    activeWorkflowLabel?: string | null
}

const ITEMS: { mode: EditorMode; icon: React.ReactNode; label: string }[] = [
    {
        mode: 'class-diagram',
        icon: <LayoutGrid className="h-5 w-5" />,
        label: 'Class Diagram',
    },
    {
        mode: 'workflow',
        icon: <GitBranch className="h-5 w-5" />,
        label: 'Workflow Editor',
    },
]

export function ActivitySidebar({
    mode,
    onModeChange,
    activeWorkflowLabel,
}: ActivitySidebarProps) {
    return (
        <div
            className="flex flex-col items-center gap-1 py-2 border-r"
            style={{ width: 48, minWidth: 48, background: 'var(--color-activity-bar, #1e293b)' }}
        >
            {ITEMS.map((item) => {
                const isActive = mode === item.mode
                return (
                    <button
                        key={item.mode}
                        title={item.mode === 'workflow' && activeWorkflowLabel
                            ? `${item.label}: ${activeWorkflowLabel}`
                            : item.label}
                        onClick={() => onModeChange(item.mode)}
                        className="relative flex items-center justify-center rounded-md transition-colors"
                        style={{
                            width: 36,
                            height: 36,
                            color: isActive ? '#f8fafc' : '#94a3b8',
                            background: isActive ? 'rgba(255,255,255,0.12)' : 'transparent',
                            border: isActive ? '1px solid rgba(255,255,255,0.18)' : '1px solid transparent',
                        }}
                    >
                        {item.icon}
                        {/* Active bar on the left edge */}
                        {isActive && (
                            <span
                                className="absolute left-0 top-1/2 -translate-y-1/2 rounded-r"
                                style={{ width: 3, height: 20, background: '#3b82f6' }}
                            />
                        )}
                        {/* Badge: workflow has active operation */}
                        {item.mode === 'workflow' && activeWorkflowLabel && !isActive && (
                            <span
                                className="absolute top-0.5 right-0.5 rounded-full"
                                style={{ width: 7, height: 7, background: '#3b82f6' }}
                            />
                        )}
                    </button>
                )
            })}
        </div>
    )
}