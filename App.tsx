
import React, { useState, useRef, useEffect } from 'react';
import { ExtensionFile, ExtensionProject } from './types';
import { generateExtension, refineExtension, chatWithAI } from './geminiService';
import FileTree from './components/FileTree';
import CodePreview from './components/CodePreview';
import JSZip from 'jszip';

interface Message {
  role: 'user' | 'ai';
  text: string;
  sources?: { title: string; uri: string }[];
}

const App: React.FC = () => {
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isChatting, setIsChatting] = useState(false);
  const [project, setProject] = useState<ExtensionProject | null>(null);
  const [selectedFile, setSelectedFile] = useState<ExtensionFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'files' | 'chat'>('files');
  const [hasNewChat, setHasNewChat] = useState(false);
  
  // State cho refinement & chat
  const [refineInput, setRefineInput] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // State cho hình ảnh & ZIP upload
  const [image, setImage] = useState<{ data: string; mimeType: string; preview: string } | null>(null);
  const [refineImage, setRefineImage] = useState<{ data: string; mimeType: string; preview: string } | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const refineFileInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isChatting]);

  useEffect(() => {
    if (activeTab === 'chat') setHasNewChat(false);
  }, [activeTab]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'initial' | 'refine') => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const imgData = {
          data: (reader.result as string).split(',')[1],
          mimeType: file.type,
          preview: reader.result as string
        };
        if (type === 'initial') setImage(imgData);
        else setRefineImage(imgData);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleZipUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsGenerating(true);
    setError(null);

    try {
      const zip = new JSZip();
      const loadedZip = await zip.loadAsync(file);
      const extractedFiles: ExtensionFile[] = [];
      let extName = file.name.replace('.zip', '');
      let extDesc = "Imported extension project";

      for (const [path, zipEntry] of Object.entries(loadedZip.files)) {
        const entry = zipEntry as any;
        if (!entry.dir && !path.includes('__MACOSX') && !path.includes('.DS_Store')) {
          const content = await entry.async('string');
          const extension = path.split('.').pop() || '';
          
          let language = 'javascript';
          if (extension === 'json') language = 'json';
          else if (extension === 'html') language = 'html';
          else if (extension === 'css') language = 'css';

          if (path.endsWith('manifest.json')) {
            try {
              const manifest = JSON.parse(content);
              extName = manifest.name || extName;
              extDesc = manifest.description || extDesc;
            } catch (e) { /* ignore manifest parse errors */ }
          }

          extractedFiles.push({ path, content, language });
        }
      }

      if (extractedFiles.length === 0) throw new Error("Không tìm thấy file hợp lệ trong ZIP.");

      const newProject: ExtensionProject = {
        id: Date.now().toString(),
        name: extName,
        description: extDesc,
        files: extractedFiles,
        createdAt: Date.now()
      };

      setProject(newProject);
      setSelectedFile(newProject.files[0]);
      setActiveTab('files');
    } catch (err: any) {
      setError("Lỗi khi đọc file ZIP: " + err.message);
    } finally {
      setIsGenerating(false);
      if (zipInputRef.current) zipInputRef.current.value = '';
    }
  };

  const handleDownloadZip = async () => {
    if (!project) return;
    try {
      const zip = new JSZip();
      project.files.forEach((file) => {
        zip.file(file.path, file.content);
      });
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${project.name.replace(/\s+/g, '_') || 'chrome_extension'}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError("Không thể tạo file ZIP để tải về.");
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    setError(null);
    try {
      const result = await generateExtension(prompt, image ? { data: image.data, mimeType: image.mimeType } : undefined);
      const newProject = { id: Date.now().toString(), ...result, createdAt: Date.now() };
      setProject(newProject);
      setSelectedFile(newProject.files[0]);
      setActiveTab('files');
    } catch (err: any) { setError(err.message); }
    finally { setIsGenerating(false); }
  };

  const handleRefine = async () => {
    if (!refineInput.trim() || !project) return;
    setIsGenerating(true);
    setError(null);
    try {
      const result = await refineExtension(
        project.files, 
        refineInput, 
        refineImage ? { data: refineImage.data, mimeType: refineImage.mimeType } : undefined
      );
      
      setProject({ 
        ...project, 
        files: result.files,
        name: result.name,
        description: result.description
      });

      setChatMessages(prev => [...prev, 
        { role: 'user', text: `Yêu cầu thay đổi: ${refineInput}` },
        { role: 'ai', text: `### ✨ Đã thực hiện xong!\n\n${result.explanation}` }
      ]);
      
      setRefineInput('');
      setRefineImage(null);
      setSelectedFile(result.files.find(f => f.path === selectedFile?.path) || result.files[0]);
      
      setActiveTab('chat');
    } catch (err: any) { 
      setError(err.message); 
    } finally { 
      setIsGenerating(false); 
    }
  };

  const handleChat = async () => {
    if (!chatInput.trim() || !project) return;
    const userMsg = chatInput;
    setChatMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setChatInput('');
    setIsChatting(true);
    try {
      const aiResponse = await chatWithAI(project.files, userMsg);
      setChatMessages(prev => [...prev, { 
        role: 'ai', 
        text: aiResponse.text, 
        sources: aiResponse.sources 
      }]);
    } catch (err) {
      setChatMessages(prev => [...prev, { role: 'ai', text: "Tôi đang gặp chút sự cố kết nối, bạn thử lại sau ít giây nhé!" }]);
    } finally {
      setIsChatting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col overflow-hidden bg-slate-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg">
            <i className="fab fa-chrome text-xl"></i>
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800 tracking-tight">Addon AI Editor</h1>
            <p className="text-[10px] text-indigo-500 font-bold uppercase tracking-widest">Simple & Powerful Assistant</p>
          </div>
        </div>
        
        <div className="flex gap-3">
          <button 
            onClick={() => zipInputRef.current?.click()}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg border border-slate-200 transition-all flex items-center gap-2"
          >
            <i className="fas fa-file-import"></i> Tải lên .ZIP
          </button>
          <input type="file" ref={zipInputRef} className="hidden" onChange={handleZipUpload} accept=".zip" />
          
          {project && (
            <button onClick={handleDownloadZip} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-lg flex items-center gap-2 shadow-md transition-all">
              <i className="fas fa-download"></i> Tải về (.ZIP)
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside className="w-[380px] bg-white border-r border-gray-200 flex flex-col shadow-xl z-10">
          {!project ? (
            <div className="p-6 h-full flex flex-col">
              <div className="flex-1">
                <label className="block text-sm font-bold text-slate-700 mb-2">Ý tưởng Addon của bạn</label>
                <textarea
                  className="w-full h-40 p-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none resize-none text-sm leading-relaxed"
                  placeholder="Mô tả ý tưởng... ví dụ: Tạo một tiện ích ghi chú nhanh khi lướt web."
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                />
                <div className="mt-4 flex items-center justify-between">
                  <button onClick={() => fileInputRef.current?.click()} className="text-xs font-bold text-indigo-600 flex items-center gap-2 hover:bg-indigo-50 p-2 rounded-lg transition-colors">
                    <i className="fas fa-camera"></i> {image ? 'Đã đính kèm ảnh' : 'Thêm ảnh minh họa'}
                  </button>
                  <input type="file" ref={fileInputRef} className="hidden" onChange={(e) => handleImageChange(e, 'initial')} accept="image/*" />
                  {image && (
                    <div className="flex items-center gap-2">
                       <img src={image.preview} className="w-8 h-8 rounded border object-cover shadow-sm" alt="Preview" />
                       <button onClick={() => setImage(null)} className="text-[10px] text-red-500 font-bold hover:underline">Xóa</button>
                    </div>
                  )}
                </div>
                <button onClick={handleGenerate} disabled={isGenerating || !prompt.trim()} className="w-full mt-4 py-3 bg-indigo-600 text-white rounded-xl font-bold shadow-lg disabled:bg-slate-300 transition-all active:scale-95 flex items-center justify-center gap-2">
                  {isGenerating ? <i className="fas fa-circle-notch animate-spin"></i> : <i className="fas fa-magic"></i>}
                  {isGenerating ? 'Đang chuẩn bị mã nguồn...' : 'Bắt đầu tạo ngay'}
                </button>
              </div>

              <div className="mt-6 p-6 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50 flex flex-col items-center justify-center text-center">
                <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm mb-3">
                  <i className="fas fa-file-archive text-indigo-500"></i>
                </div>
                <p className="text-xs font-bold text-slate-700 mb-1">Đã có Addon sẵn?</p>
                <p className="text-[10px] text-slate-500 mb-4">Kéo thả file .zip vào đây để AI giúp bạn chỉnh sửa tiếp.</p>
                <button 
                  onClick={() => zipInputRef.current?.click()}
                  className="text-xs font-bold text-indigo-600 px-4 py-2 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors"
                >
                  Chọn file từ máy tính
                </button>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex gap-1 bg-slate-50/50">
                <button onClick={() => setActiveTab('files')} className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${activeTab === 'files' ? 'bg-white text-indigo-700 shadow-sm border border-slate-200' : 'text-slate-500 hover:bg-slate-100'}`}>
                  <i className="fas fa-folder-tree"></i> Xem File
                </button>
                <button onClick={() => setActiveTab('chat')} className={`relative flex-1 py-2.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${activeTab === 'chat' ? 'bg-white text-indigo-700 shadow-sm border border-slate-200' : 'text-slate-500 hover:bg-slate-100'}`}>
                  <i className="fas fa-comment-dots"></i> Thảo luận
                  {hasNewChat && <span className="absolute top-2 right-4 w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>}
                </button>
              </div>

              {activeTab === 'files' ? (
                <div className="flex-1 flex flex-col overflow-hidden">
                  <div className="flex-1 overflow-y-auto">
                    <FileTree files={project.files} selectedFile={selectedFile} onSelect={setSelectedFile} />
                  </div>
                  <div className="p-4 bg-slate-900 border-t border-slate-800 shadow-[0_-4px_15px_rgba(0,0,0,0.2)]">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-2">
                        <span className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse"></span>
                        Cải tiến Addon
                      </h4>
                      <button 
                        onClick={() => refineFileInputRef.current?.click()}
                        className="text-[10px] text-indigo-300 hover:text-white flex items-center gap-1.5 py-1 px-2 rounded-md border border-slate-700 hover:border-indigo-400 transition-all"
                      >
                        <i className="fas fa-image"></i> {refineImage ? 'Đã có ảnh' : 'Kèm ảnh lỗi'}
                      </button>
                      <input type="file" ref={refineFileInputRef} className="hidden" onChange={(e) => handleImageChange(e, 'refine')} accept="image/*" />
                    </div>

                    <textarea 
                      placeholder="Gợi ý: 'Thêm nút lưu dữ liệu' hoặc 'Đổi màu nút bấm thành đỏ'..."
                      className="w-full h-24 p-3 text-xs bg-slate-800 text-slate-100 border border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 resize-none mb-3 placeholder-slate-500 shadow-inner leading-relaxed"
                      value={refineInput}
                      onChange={(e) => setRefineInput(e.target.value)}
                    />

                    {refineImage && (
                      <div className="flex items-center gap-3 mb-4 p-2 bg-slate-800/50 rounded-lg border border-slate-700">
                        <img src={refineImage.preview} className="w-12 h-12 rounded-md border border-slate-600 object-cover" alt="Refine Preview" />
                        <div className="flex-1 overflow-hidden">
                          <p className="text-[10px] text-slate-300 font-medium">Ảnh minh họa yêu cầu</p>
                          <p className="text-[9px] text-slate-500 italic">Sẽ gửi kèm để AI dễ hiểu</p>
                        </div>
                        <button onClick={() => setRefineImage(null)} className="text-red-400 hover:text-red-300 p-2">
                          <i className="fas fa-trash-alt"></i>
                        </button>
                      </div>
                    )}

                    <button 
                      onClick={handleRefine} 
                      disabled={isGenerating || !refineInput.trim()} 
                      className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-lg disabled:bg-slate-700 disabled:text-slate-500 transition-all flex items-center justify-center gap-2"
                    >
                      {isGenerating ? <i className="fas fa-sync-alt animate-spin"></i> : <i className="fas fa-bolt"></i>}
                      {isGenerating ? 'Đang cập nhật code...' : 'Cập nhật ngay'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col overflow-hidden bg-slate-50/30">
                  <div className="flex-1 overflow-y-auto p-4 space-y-5">
                    {chatMessages.length === 0 && (
                      <div className="flex flex-col items-center justify-center h-full text-center space-y-4 p-8 opacity-60">
                        <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center text-indigo-400 shadow-sm border border-slate-100">
                           <i className="fas fa-hand-sparkles text-2xl"></i>
                        </div>
                        <p className="text-xs text-slate-500 leading-relaxed font-medium">Bạn có thể hỏi bất cứ gì, ví dụ: "Cách lấy element nút bấm trên trang google.com"</p>
                      </div>
                    )}
                    {chatMessages.map((msg, i) => (
                      <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                        <div className={`max-w-[90%] p-4 rounded-2xl shadow-sm text-sm leading-relaxed ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white text-slate-800 rounded-tl-none border border-slate-200'}`}>
                          {msg.text.split('\n').map((line, idx) => {
                            if (line.startsWith('###')) {
                              return <div key={idx} className="font-bold text-indigo-600 text-base mb-2 mt-1 flex items-center gap-2">
                                <i className="fas fa-star-of-life text-[10px]"></i> {line.replace('###', '').trim()}
                              </div>;
                            }
                            if (line.trim().startsWith('-')) {
                              return <div key={idx} className="ml-4 flex gap-2 mb-1">
                                <span className="text-indigo-400">•</span>
                                <span>{line.replace('-', '').trim()}</span>
                              </div>;
                            }
                            return <p key={idx} className={line.trim() === '' ? 'h-2' : 'mb-1.5'}>{line}</p>;
                          })}
                          
                          {msg.sources && msg.sources.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-slate-100">
                               <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Nguồn tham khảo từ web:</p>
                               <div className="flex flex-wrap gap-2">
                                 {msg.sources.map((src, sIdx) => (
                                   <a 
                                    key={sIdx} 
                                    href={src.uri} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="text-[10px] bg-slate-50 text-indigo-600 px-2 py-1 rounded border border-indigo-100 hover:bg-indigo-50 transition-colors flex items-center gap-1"
                                   >
                                     <i className="fas fa-link text-[8px]"></i> {src.title}
                                   </a>
                                 ))}
                               </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    {isChatting && (
                      <div className="flex justify-start">
                         <div className="bg-white border border-slate-200 p-4 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-3">
                            <div className="flex gap-1">
                               <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce"></div>
                               <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                               <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:0.4s]"></div>
                            </div>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Đang tra cứu dữ liệu...</span>
                         </div>
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>
                  <div className="p-4 border-t border-slate-200 bg-white">
                    <div className="flex gap-2">
                      <input 
                        className="flex-1 px-4 py-2.5 text-xs border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-400 bg-slate-50 transition-all" 
                        placeholder="Ví dụ: Lấy phần tử khung search trên labs.google..." 
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleChat()}
                        disabled={isChatting}
                      />
                      <button 
                        onClick={handleChat} 
                        disabled={isChatting || !chatInput.trim()}
                        className="w-12 h-10 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all shadow-md flex items-center justify-center disabled:bg-slate-300"
                      >
                        <i className="fas fa-paper-plane"></i>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </aside>

        {/* Code View */}
        <section className="flex-1 relative bg-white flex flex-col">
          <CodePreview file={selectedFile} />
          {isGenerating && (
            <div className="absolute inset-0 bg-white/90 backdrop-blur-md flex flex-col items-center justify-center z-20">
              <div className="relative w-20 h-20 mb-6">
                <div className="absolute inset-0 border-4 border-indigo-100 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
              </div>
              <h2 className="text-xl font-bold text-slate-800 mb-2">Đang suy luận logic...</h2>
              <p className="text-sm text-slate-500 animate-pulse font-medium">Vui lòng đợi trong giây lát</p>
            </div>
          )}
        </section>
      </main>

      {error && (
        <div className="fixed bottom-10 right-10 bg-slate-900 text-white px-6 py-4 rounded-2xl shadow-2xl z-50 flex items-center gap-4 border border-slate-700 animate-in fade-in slide-in-from-bottom-5 duration-300">
          <div className="w-10 h-10 bg-red-500/20 text-red-400 rounded-full flex items-center justify-center">
            <i className="fas fa-bolt"></i>
          </div>
          <div>
            <p className="font-bold text-sm">Trục trặc</p>
            <p className="text-xs text-slate-400">{error}</p>
          </div>
          <button onClick={() => setError(null)} className="ml-2 w-8 h-8 rounded-full hover:bg-slate-800 flex items-center justify-center transition-colors">
            <i className="fas fa-times text-xs"></i>
          </button>
        </div>
      )}
    </div>
  );
};

export default App;
