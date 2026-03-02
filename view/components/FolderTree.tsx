import React, { useMemo, useState, useEffect, useRef } from 'react';

export interface FileEntry {
    path: string;
    isDirectory: boolean;
}

export interface FolderTreeProps {
    files: FileEntry[];
    activeFilePath: string | null;
    onSelectFile: (path: string) => void;
    onCreateFile: (path: string) => void; // path here is the parent folder
    onCreateFolder: (path: string) => void; // path here is the parent folder
    onDelete: (path: string) => void;
    onRename: (oldPath: string, newName: string) => void;
    onRefresh: () => void;
}

interface TreeNode {
    name: string;
    path: string;
    isDirectory: boolean;
    children: Record<string, TreeNode>;
}

export function FolderTree({
    files, activeFilePath, onSelectFile, onCreateFile, onCreateFolder, onDelete, onRename, onRefresh
}: FolderTreeProps) {
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['']));
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, path: string, isDirectory: boolean } | null>(null);
    const [renamingPath, setRenamingPath] = useState<string | null>(null);
    const [renamingValue, setRenamingValue] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    // Auto-focus input when renaming
    useEffect(() => {
        if (renamingPath && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [renamingPath]);

    // Close context menu on click elsewhere
    useEffect(() => {
        const handleClick = () => setContextMenu(null);
        window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    }, []);

    const toggleFolder = (path: string) => {
        setExpandedFolders(prev => {
            const next = new Set(prev);
            if (next.has(path)) {
                next.delete(path);
            } else {
                next.add(path);
            }
            return next;
        });
    };

    const tree = useMemo(() => {
        const root: TreeNode = { name: '', path: '', isDirectory: true, children: {} };

        // Sort files to ensure parents are processed before children
        const sortedFiles = [...files].sort((a, b) => a.path.split('/').length - b.path.split('/').length);

        for (const file of sortedFiles) {
            const parts = file.path.split('/');
            let current = root;
            let currentPath = '';

            for (let i = 0; i < parts.length; i++) {
                const part = parts[i];
                const isLastPart = i === parts.length - 1;
                currentPath = currentPath ? `${currentPath}/${part}` : part;

                if (!current.children[part]) {
                    current.children[part] = {
                        name: part,
                        path: currentPath,
                        isDirectory: isLastPart ? file.isDirectory : true,
                        children: {}
                    };
                } else if (isLastPart) {
                    current.children[part].isDirectory = file.isDirectory;
                }
                current = current.children[part];
            }
        }
        return root;
    }, [files]);

    const handleContextMenu = (e: React.MouseEvent, path: string, isDirectory: boolean) => {
        e.preventDefault();
        setContextMenu({
            x: e.clientX,
            y: e.clientY,
            path,
            isDirectory
        });
    };

    const startRenaming = (path: string, currentName: string) => {
        setRenamingPath(path);
        setRenamingValue(currentName);
        setContextMenu(null);
    };

    const commitRename = () => {
        if (renamingPath && renamingValue && renamingValue.trim() !== '') {
            const oldName = renamingPath.split('/').pop() || '';
            if (renamingValue !== oldName) {
                onRename(renamingPath, renamingValue.trim());
            }
        }
        setRenamingPath(null);
    };

    const renderNode = (node: TreeNode, depth: number = 0): React.ReactNode => {
        const isExpanded = expandedFolders.has(node.path) || node.path === '';

        if (node.path === '') {
            return Object.values(node.children)
                .sort((a, b) => {
                    if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
                    return a.isDirectory ? -1 : 1;
                })
                .map(child => renderNode(child, 0));
        }

        const isActive = activeFilePath === node.path;
        const isRenaming = renamingPath === node.path;

        return (
            <div key={node.path} style={{ display: 'flex', flexDirection: 'column' }}>
                <div
                    onClick={() => {
                        if (node.isDirectory) toggleFolder(node.path);
                        else onSelectFile(node.path);
                    }}
                    onDoubleClick={(e) => {
                        e.stopPropagation();
                        if (node.path.endsWith('_Application')) return;
                        startRenaming(node.path, node.name);
                    }}
                    onContextMenu={(e) => handleContextMenu(e, node.path, node.isDirectory)}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: `4px 8px 4px ${8 + depth * 12}px`,
                        cursor: 'pointer',
                        background: isActive ? '#3b82f640' : 'transparent',
                        color: isActive ? '#60a5fa' : '#cbd5e1',
                        userSelect: 'none',
                        fontSize: 11,
                        fontFamily: '"Cascadia Code","SF Mono",monospace',
                        borderLeft: isActive ? '2px solid #3b82f6' : '2px solid transparent',
                    }}
                    onMouseEnter={e => {
                        if (!isActive) e.currentTarget.style.background = '#1e293b';
                    }}
                    onMouseLeave={e => {
                        if (!isActive) e.currentTarget.style.background = 'transparent';
                    }}
                >
                    <span style={{
                        width: 14,
                        display: 'inline-block',
                        textAlign: 'center',
                        marginRight: 4,
                        color: node.isDirectory ? '#fbbf24' : '#94a3b8',
                        fontSize: 10
                    }}>
                        {node.isDirectory ? (isExpanded ? '▾' : '▸') : '≡'}
                    </span>
                    {isRenaming ? (
                        <input
                            ref={inputRef}
                            value={renamingValue}
                            onChange={(e) => setRenamingValue(e.target.value)}
                            onBlur={commitRename}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') commitRename();
                                if (e.key === 'Escape') setRenamingPath(null);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                                background: '#1e293b',
                                border: '1px solid #3b82f6',
                                color: '#e2e8f0',
                                fontSize: 11,
                                fontFamily: 'inherit',
                                padding: '0 2px',
                                width: '100%',
                                outline: 'none'
                            }}
                        />
                    ) : (
                        <span style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                        }}>{node.name}</span>
                    )}
                </div>
                {node.isDirectory && isExpanded && (
                    <div>
                        {Object.values(node.children)
                            .sort((a, b) => {
                                if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
                                return a.isDirectory ? -1 : 1;
                            })
                            .map(child => renderNode(child, depth + 1))}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div style={{
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
            flex: 1, position: 'relative'
        }}>
            <div style={{
                padding: '5px 10px', fontSize: 10, fontWeight: 700,
                color: '#334155', letterSpacing: '0.1em', textTransform: 'uppercase',
                borderBottom: '1px solid #1e293b', borderTop: '1px solid #1e293b', flexShrink: 0,
                fontFamily: '"Cascadia Code","SF Mono",monospace',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
                <span>.DIAGRAM</span>
                <div style={{ display: 'flex', gap: '2px' }}>
                    <button
                        onClick={() => onCreateFile('')}
                        title="New File"
                        style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '0 2px', fontSize: 13 }}
                        onMouseEnter={e => e.currentTarget.style.color = '#e2e8f0'}
                        onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}
                    >
                        ⊞
                    </button>
                    <button
                        onClick={() => onCreateFolder('')}
                        title="New Folder"
                        style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '0 2px', fontSize: 13 }}
                        onMouseEnter={e => e.currentTarget.style.color = '#e2e8f0'}
                        onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}
                    >
                        📁
                    </button>
                    <button
                        onClick={onRefresh}
                        title="Refresh"
                        style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '0 2px', fontSize: 11 }}
                        onMouseEnter={e => e.currentTarget.style.color = '#e2e8f0'}
                        onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}
                    >
                        ↻
                    </button>
                </div>
            </div>
            <div style={{ overflowY: 'auto', flex: 1, padding: '4px 0' }}>
                {files.length === 0 ? (
                    <div style={{ padding: '8px 12px', fontSize: 11, color: '#475569', fontStyle: 'italic' }}>
                        No files found
                    </div>
                ) : (
                    renderNode(tree)
                )}
            </div>

            {/* Context Menu */}
            {contextMenu && (
                <div style={{
                    position: 'fixed',
                    top: contextMenu.y,
                    left: contextMenu.x,
                    background: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: 4,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                    zIndex: 1000,
                    padding: '4px 0',
                    minWidth: 120,
                    fontFamily: 'system-ui, sans-serif'
                }}>
                    {contextMenu.isDirectory && (
                        <>
                            <ContextMenuItem
                                onClick={() => onCreateFile(contextMenu.path)}
                                label="New File"
                                icon="⊞"
                            />
                            <ContextMenuItem
                                onClick={() => onCreateFolder(contextMenu.path)}
                                label="New Folder"
                                icon="📁"
                            />
                            <div style={{ height: 1, background: '#334155', margin: '4px 0' }} />
                        </>
                    )}
                    {!contextMenu.path.endsWith('_Application') && (
                        <>
                            <ContextMenuItem
                                onClick={() => startRenaming(contextMenu.path, contextMenu.path.split('/').pop() || '')}
                                label="Rename"
                                icon="✎"
                            />
                            <ContextMenuItem
                                onClick={() => onDelete(contextMenu.path)}
                                label="Delete"
                                icon="×"
                                color="#f87171"
                            />
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

function ContextMenuItem({ onClick, label, icon, color = '#cbd5e1' }: { onClick: () => void, label: string, icon: string, color?: string }) {
    return (
        <div
            onClick={(e) => {
                e.stopPropagation();
                onClick();
            }}
            style={{
                padding: '4px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                cursor: 'pointer',
                fontSize: 11,
                color: color,
                transition: 'background 0.1s'
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#334155'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
            <span style={{ width: 14, textAlign: 'center', fontSize: 12 }}>{icon}</span>
            <span>{label}</span>
        </div>
    );
}
