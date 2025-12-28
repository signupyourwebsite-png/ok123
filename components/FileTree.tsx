
import React from 'react';
import { ExtensionFile } from '../types';

interface FileTreeProps {
  files: ExtensionFile[];
  selectedFile: ExtensionFile | null;
  onSelect: (file: ExtensionFile) => void;
}

const FileTree: React.FC<FileTreeProps> = ({ files, selectedFile, onSelect }) => {
  const getIcon = (path: string) => {
    if (path.endsWith('.json')) return 'fa-file-code text-blue-500';
    if (path.endsWith('.js')) return 'fa-brands fa-js text-yellow-500';
    if (path.endsWith('.html')) return 'fa-brands fa-html5 text-orange-500';
    if (path.endsWith('.css')) return 'fa-brands fa-css3-alt text-blue-400';
    return 'fa-file text-gray-400';
  };

  return (
    <div className="flex flex-col gap-1 p-2">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-2">Project Files</h3>
      {files.map((file) => (
        <button
          key={file.path}
          onClick={() => onSelect(file)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all text-left ${
            selectedFile?.path === file.path 
              ? 'bg-blue-50 text-blue-700 shadow-sm border border-blue-100' 
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <i className={`fas ${getIcon(file.path)} w-5`}></i>
          <span className="truncate">{file.path}</span>
        </button>
      ))}
    </div>
  );
};

export default FileTree;
