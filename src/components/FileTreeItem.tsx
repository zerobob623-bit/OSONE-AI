import React, { useState } from 'react';
import { Folder, FileText, FilePlus, Plus, Trash2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { FileSystemItem } from '../types';

export const FileTreeItem = ({ 
  item, 
  depth, 
  selectedFileId, 
  setSelectedFileId, 
  onAddFile, 
  onAddFolder, 
  onDelete, 
  onRename 
}: { 
  item: FileSystemItem; 
  depth: number;
  selectedFileId: string | null;
  setSelectedFileId: (id: string | null) => void;
  onAddFile: (parentId: string, name: string) => void;
  onAddFolder: (parentId: string, name: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(item.name);
  const [isExpanded, setIsExpanded] = useState(true);
  const [isAdding, setIsAdding] = useState<'file' | 'folder' | null>(null);
  const [newName, setNewName] = useState('');

  const handleRename = () => {
    if (editName.trim() && editName !== item.name) {
      onRename(item.id, editName);
    }
    setIsEditing(false);
  };

  const handleAdd = () => {
    if (newName.trim()) {
      if (isAdding === 'file') {
        onAddFile(item.id, newName.trim());
      } else if (isAdding === 'folder') {
        onAddFolder(item.id, newName.trim());
      }
    }
    setIsAdding(null);
    setNewName('');
    setIsExpanded(true);
  };

  return (
    <div className="space-y-1">
      <div 
        className={cn(
          "flex items-center justify-between group px-2 py-1.5 rounded-lg cursor-pointer transition-colors",
          item.type === 'file' && selectedFileId === item.id ? "bg-her-accent/20 text-her-accent" : "hover:bg-white/5 text-her-muted",
          item.type === 'folder' && "text-her-ink"
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={() => {
          if (item.type === 'file') {
            setSelectedFileId(item.id);
          } else {
            setIsExpanded(!isExpanded);
          }
        }}
      >
        <div className="flex items-center gap-2 text-sm flex-1 min-w-0">
          {item.type === 'folder' ? (
            <Folder size={14} className={cn("text-her-accent shrink-0", !isExpanded && "opacity-50")} />
          ) : (
            <FileText size={14} className="shrink-0" />
          )}
          
          {isEditing ? (
            <input 
              autoFocus
              className="bg-white/50 border border-her-accent/30 rounded px-1 w-full focus:outline-none text-xs"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={handleRename}
              onKeyDown={(e) => e.key === 'Enter' && handleRename()}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="truncate" onDoubleClick={(e) => { e.stopPropagation(); setIsEditing(true); }}>
              {item.name}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity shrink-0">
          {item.type === 'folder' && (
            <>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setIsAdding('file');
                  setNewName('');
                  setIsExpanded(true);
                }}
                className="p-2 md:p-1 hover:bg-white/10 rounded text-her-muted hover:text-her-accent"
                title="Novo Arquivo"
              >
                <FilePlus size={16} className="md:w-3 md:h-3" />
              </button>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setIsAdding('folder');
                  setNewName('');
                  setIsExpanded(true);
                }}
                className="p-2 md:p-1 hover:bg-white/10 rounded text-her-muted hover:text-her-accent"
                title="Nova Subpasta"
              >
                <Plus size={16} className="md:w-3 md:h-3" />
              </button>
            </>
          )}
          <button 
            onClick={(e) => {
              e.stopPropagation();
              onDelete(item.id);
            }}
            className="p-2 md:p-1 hover:bg-white/10 rounded text-her-muted hover:text-red-400"
            title="Excluir"
          >
            <Trash2 size={16} className="md:w-3 md:h-3" />
          </button>
        </div>
      </div>

      {isAdding && (
        <div 
          className="flex items-center gap-2 text-sm px-2 py-1.5"
          style={{ paddingLeft: `${(depth + 1) * 12 + 8}px` }}
        >
          {isAdding === 'folder' ? (
            <Folder size={14} className="text-her-accent shrink-0" />
          ) : (
            <FileText size={14} className="shrink-0 text-her-muted" />
          )}
          <input
            autoFocus
            className="bg-white/50 border border-her-accent/30 rounded px-1 w-full focus:outline-none text-xs"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onBlur={handleAdd}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd();
              if (e.key === 'Escape') {
                setIsAdding(null);
                setNewName('');
              }
            }}
            placeholder={`Nome do ${isAdding === 'folder' ? 'diretório' : 'arquivo'}...`}
          />
        </div>
      )}

      {item.type === 'folder' && isExpanded && (
        <div className="space-y-1">
          {(item.children || []).map(child => (
            <FileTreeItem 
              key={child.id}
              item={child}
              depth={depth + 1}
              selectedFileId={selectedFileId}
              setSelectedFileId={setSelectedFileId}
              onAddFile={onAddFile}
              onAddFolder={onAddFolder}
              onDelete={onDelete}
              onRename={onRename}
            />
          ))}
        </div>
      )}
    </div>
  );
};
