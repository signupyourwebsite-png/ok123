
import React from 'react';
import { ExtensionFile } from '../types';

interface CodePreviewProps {
  file: ExtensionFile | null;
}

const CodePreview: React.FC<CodePreviewProps> = ({ file }) => {
  if (!file) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-400 p-8 text-center">
        <i className="fas fa-code text-5xl mb-4 opacity-20"></i>
        <p>Chọn một file để xem mã nguồn</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-100 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-gray-500 bg-white px-2 py-1 rounded border border-gray-200 uppercase">
            {file.language}
          </span>
          <span className="text-sm font-medium text-gray-700">{file.path}</span>
        </div>
        <button 
          onClick={() => {
            navigator.clipboard.writeText(file.content);
            alert('Đã sao chép vào bộ nhớ tạm!');
          }}
          className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium"
        >
          <i className="fas fa-copy"></i> Copy
        </button>
      </div>
      <pre className="flex-1 overflow-auto p-4 bg-slate-900 text-slate-100 text-sm leading-relaxed code-font whitespace-pre-wrap">
        <code>{file.content}</code>
      </pre>
    </div>
  );
};

export default CodePreview;
