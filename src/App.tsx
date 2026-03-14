import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from "@google/genai";
import { 
  Camera, 
  Upload, 
  History, 
  Settings, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  ArrowRight, 
  X, 
  RefreshCw,
  Lock,
  FileText,
  Search,
  ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from './lib/utils';
import * as pdfjsLib from 'pdfjs-dist';

// PDF.js worker setup
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js`;

// Types
interface AdminConfig {
  document_title: string;
  google_drive_link: string;
  extracted_document_text: string;
  ai_session_initialized: boolean;
  created_at: string;
}

interface QuestionHistory {
  id: string;
  question: string;
  answer: string;
  source: string;
  timestamp: string;
}

const App: React.FC = () => {
  // Auth & Navigation
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [activeTab, setActiveTab] = useState<'ask' | 'history' | 'admin'>('ask');
  
  // Admin State
  const [adminConfig, setAdminConfig] = useState<AdminConfig | null>(() => {
    const saved = localStorage.getItem('ai_pdf_lens_config');
    return saved ? JSON.parse(saved) : null;
  });
  const [driveUrl, setDriveUrl] = useState('');
  const [docTitle, setDocTitle] = useState('');

  // User State
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [ocrResult, setOcrResult] = useState<string | null>(null);
  const [isEditingOcr, setIsEditingOcr] = useState(false);
  const [answer, setAnswer] = useState<QuestionHistory | null>(null);
  const [history, setHistory] = useState<QuestionHistory[]>(() => {
    const saved = localStorage.getItem('ai_pdf_lens_history');
    return saved ? JSON.parse(saved) : [];
  });

  // Camera Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);

  // Gemini Setup
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

  // Persistence
  useEffect(() => {
    if (adminConfig) {
      localStorage.setItem('ai_pdf_lens_config', JSON.stringify(adminConfig));
    }
  }, [adminConfig]);

  useEffect(() => {
    localStorage.setItem('ai_pdf_lens_history', JSON.stringify(history));
  }, [history]);

  // Admin Login
  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPassword === 'admin123') { // Simple default password
      setIsAdminLoggedIn(true);
      setAdminPassword('');
    } else {
      alert("Invalid password");
    }
  };

  // PDF Extraction Logic
  const processPdfText = async (arrayBuffer: ArrayBuffer) => {
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item: any) => item.str).join(" ");
      fullText += pageText + "\n";
    }
    return fullText;
  };

  const handleDriveImport = async () => {
    if (!driveUrl || !docTitle) return;
    
    let fileId = "";
    const match = driveUrl.match(/[-\w]{25,}/);
    if (match) {
      fileId = match[0];
    } else {
      alert("Invalid Google Drive URL");
      return;
    }

    const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
    setLoading(true);
    setStatus("Fetching PDF...");

    try {
      // Using the server proxy to bypass CORS
      const response = await fetch('/api/proxy-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: downloadUrl })
      });

      if (!response.ok) throw new Error("Failed to fetch PDF");

      const arrayBuffer = await response.arrayBuffer();
      setStatus("Extracting Text...");
      const text = await processPdfText(arrayBuffer);

      const newConfig: AdminConfig = {
        document_title: docTitle,
        google_drive_link: driveUrl,
        extracted_document_text: text,
        ai_session_initialized: true,
        created_at: new Date().toISOString()
      };

      setAdminConfig(newConfig);
      setStatus("Document Processed Successfully!");
      setDriveUrl("");
      setDocTitle("");
      setTimeout(() => setStatus(null), 3000);
    } catch (error) {
      console.error(error);
      setStatus("Error importing PDF");
    } finally {
      setLoading(false);
    }
  };

  // Camera Logic
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsCameraActive(true);
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
      alert("Could not access camera. Please ensure you have given permission.");
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      setIsCameraActive(false);
    }
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        setCapturedImage(dataUrl);
        stopCamera();
        runOCR(dataUrl);
      }
    }
  };

  // OCR Logic using Tesseract.js
  const runOCR = async (image: string) => {
    setLoading(true);
    setStatus("Performing OCR...");
    try {
      // @ts-ignore
      const worker = await window.Tesseract.createWorker('eng');
      const { data: { text } } = await worker.recognize(image);
      await worker.terminate();
      setOcrResult(text.trim());
      setIsEditingOcr(true);
    } catch (error) {
      console.error("OCR Error:", error);
      setStatus("OCR Failed");
    } finally {
      setLoading(false);
      setStatus(null);
    }
  };

  // AI Logic
  const askQuestion = async () => {
    if (!ocrResult || !adminConfig) return;

    setLoading(true);
    setStatus("Analyzing Question...");

    try {
      const chat = ai.chats.create({
        model: "gemini-1.5-flash",
        config: {
          systemInstruction: `You are an AI assistant that will answer questions strictly based on the following document.
You must memorize and use this document as the only knowledge source for answering questions in this session.
Do not use any external knowledge.

Document:
${adminConfig.extracted_document_text}

From now on, answer only using this document. If the answer is not present in the document, respond exactly with: "Answer not found in the provided document."`
        }
      });

      const prompt = `Answer the following question using ONLY the previously provided document.
If the answer is not present in the document, respond exactly with: "Answer not found in the provided document."

Question:
${ocrResult}

Output Format:
Question: (extracted question text)
Answer: (answer generated strictly from the document)
Source: (relevant paragraph from the document)`;

      const result = await chat.sendMessage({ message: prompt });
      const responseText = result.text;

      // Parse response
      const lines = responseText.split('\n');
      const q = lines.find(l => l.startsWith('Question:'))?.replace('Question:', '').trim() || ocrResult;
      const a = lines.find(l => l.startsWith('Answer:'))?.replace('Answer:', '').trim() || responseText;
      const s = lines.find(l => l.startsWith('Source:'))?.replace('Source:', '').trim() || "N/A";

      const newHistory: QuestionHistory = {
        id: Date.now().toString(),
        question: q,
        answer: a,
        source: s,
        timestamp: new Date().toISOString()
      };

      setAnswer(newHistory);
      setHistory(prev => [newHistory, ...prev]);
      setCapturedImage(null);
      setOcrResult(null);
      setIsEditingOcr(false);
    } catch (error) {
      console.error("AI Error:", error);
      setStatus("AI Analysis Failed");
    } finally {
      setLoading(false);
      setStatus(null);
    }
  };

  const resetSession = () => {
    setAnswer(null);
    setCapturedImage(null);
    setOcrResult(null);
    setIsEditingOcr(false);
  };

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-emerald-500/30">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-xl border-b border-white/5 px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center">
            <Search className="w-5 h-5 text-black" />
          </div>
          <h1 className="text-lg font-bold tracking-tight">AI PDF Lens</h1>
        </div>
        {isAdminLoggedIn && (
          <button 
            onClick={() => setIsAdminLoggedIn(false)}
            className="text-xs font-medium text-zinc-500 hover:text-white transition-colors"
          >
            Logout Admin
          </button>
        )}
      </header>

      {/* Main Content */}
      <main className="pt-24 pb-32 px-6 max-w-2xl mx-auto">
        
        {/* Status Overlay */}
        <AnimatePresence>
          {status && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="fixed top-20 left-1/2 -translate-x-1/2 z-[60] bg-emerald-500 text-black px-4 py-2 rounded-full text-xs font-bold shadow-lg flex items-center gap-2"
            >
              <Loader2 className="w-3 h-3 animate-spin" />
              {status}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Admin Login Modal */}
        {activeTab === 'admin' && !isAdminLoggedIn && (
          <div className="space-y-6 py-12">
            <div className="text-center space-y-2">
              <Lock className="w-12 h-12 text-emerald-500 mx-auto" />
              <h2 className="text-2xl font-bold">Admin Login</h2>
              <p className="text-zinc-400 text-sm">Enter password to manage document</p>
            </div>
            <form onSubmit={handleAdminLogin} className="space-y-4">
              <input 
                type="password" 
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="Password"
                className="w-full bg-zinc-900 border border-white/10 rounded-2xl px-6 py-4 focus:outline-none focus:border-emerald-500 transition-colors"
              />
              <button className="w-full bg-white text-black font-bold py-4 rounded-2xl hover:bg-zinc-200 transition-colors">
                Login
              </button>
            </form>
          </div>
        )}

        {/* Admin Panel */}
        {activeTab === 'admin' && isAdminLoggedIn && (
          <div className="space-y-8">
            <div className="space-y-2">
              <h2 className="text-2xl font-bold">Admin Panel</h2>
              <p className="text-zinc-400 text-sm">Configure the PDF knowledge base.</p>
            </div>

            <div className="bg-zinc-900/50 border border-white/5 p-6 rounded-3xl space-y-6">
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Document Title</label>
                  <input 
                    type="text" 
                    value={docTitle}
                    onChange={(e) => setDocTitle(e.target.value)}
                    placeholder="e.g. Physics Textbook Chapter 1"
                    className="w-full bg-zinc-800 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Google Drive PDF Link</label>
                  <input 
                    type="text" 
                    value={driveUrl}
                    onChange={(e) => setDriveUrl(e.target.value)}
                    placeholder="Paste link here..."
                    className="w-full bg-zinc-800 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>
                <button 
                  onClick={handleDriveImport}
                  disabled={loading || !driveUrl || !docTitle}
                  className="w-full bg-emerald-500 text-black font-bold py-4 rounded-2xl hover:bg-emerald-400 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
                  Process Document
                </button>
              </div>

              {adminConfig && (
                <div className="pt-6 border-t border-white/5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold">Current Document</h3>
                    <span className="text-[10px] bg-emerald-500/10 text-emerald-500 px-2 py-1 rounded-full font-bold uppercase tracking-wider">Active</span>
                  </div>
                  <div className="bg-black/40 p-4 rounded-2xl border border-white/5 flex items-center gap-4">
                    <div className="w-10 h-10 bg-zinc-800 rounded-xl flex items-center justify-center">
                      <FileText className="w-5 h-5 text-zinc-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{adminConfig.document_title}</p>
                      <p className="text-[10px] text-zinc-500">Processed on {new Date(adminConfig.created_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      if(confirm("Are you sure you want to clear the document?")) {
                        setAdminConfig(null);
                        localStorage.removeItem('ai_pdf_lens_config');
                      }
                    }}
                    className="text-xs text-red-500 font-medium hover:underline"
                  >
                    Clear Document & Reset AI Memory
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* History Tab */}
        {activeTab === 'history' && (
          <div className="space-y-6">
            <div className="space-y-2">
              <h2 className="text-2xl font-bold">History</h2>
              <p className="text-zinc-400 text-sm">Your previous questions and answers.</p>
            </div>

            {history.length === 0 ? (
              <div className="py-20 text-center space-y-4">
                <History className="w-12 h-12 text-zinc-800 mx-auto" />
                <p className="text-zinc-500 text-sm">No history yet.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {history.map((item) => (
                  <div key={item.id} className="bg-zinc-900/50 border border-white/5 p-6 rounded-3xl space-y-4">
                    <div className="flex justify-between items-start">
                      <span className="text-[10px] text-zinc-500 font-mono">{new Date(item.timestamp).toLocaleString()}</span>
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-bold text-emerald-500 uppercase tracking-widest">Question</p>
                      <p className="text-sm text-white">{item.question}</p>
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Answer</p>
                      <p className="text-sm text-zinc-300">{item.answer}</p>
                    </div>
                    {item.source !== "N/A" && (
                      <div className="pt-4 border-t border-white/5">
                        <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-1">Source</p>
                        <p className="text-[10px] text-zinc-500 italic leading-relaxed">{item.source}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Ask Tab */}
        {activeTab === 'ask' && (
          <div className="space-y-8">
            {!adminConfig ? (
              <div className="py-20 text-center space-y-6">
                <AlertCircle className="w-16 h-16 text-zinc-800 mx-auto" />
                <div className="space-y-2">
                  <h2 className="text-xl font-bold">No Document Loaded</h2>
                  <p className="text-zinc-500 text-sm max-w-xs mx-auto">Please ask the admin to load a PDF document before asking questions.</p>
                </div>
                <button 
                  onClick={() => setActiveTab('admin')}
                  className="text-emerald-500 text-sm font-bold hover:underline"
                >
                  Go to Admin Panel
                </button>
              </div>
            ) : (
              <>
                {/* Answer Display */}
                <AnimatePresence>
                  {answer && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="bg-emerald-500 text-black p-8 rounded-[40px] space-y-6 shadow-2xl shadow-emerald-500/20"
                    >
                      <div className="flex justify-between items-start">
                        <div className="w-10 h-10 bg-black rounded-full flex items-center justify-center">
                          <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                        </div>
                        <button onClick={resetSession} className="p-2 hover:bg-black/10 rounded-full transition-colors">
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                      <div className="space-y-4">
                        <div className="space-y-1">
                          <p className="text-[10px] font-black uppercase tracking-widest opacity-50">Question</p>
                          <p className="text-lg font-bold leading-tight">{answer.question}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-[10px] font-black uppercase tracking-widest opacity-50">Answer</p>
                          <p className="text-md font-medium leading-relaxed">{answer.answer}</p>
                        </div>
                        {answer.source !== "N/A" && (
                          <div className="pt-4 border-t border-black/10">
                            <p className="text-[10px] font-black uppercase tracking-widest opacity-50 mb-1">Source Reference</p>
                            <p className="text-[10px] font-medium italic opacity-70 leading-relaxed">{answer.source}</p>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Camera / OCR Flow */}
                <div className="space-y-6">
                  {!isCameraActive && !capturedImage && (
                    <div className="text-center space-y-6">
                      <div className="w-32 h-32 bg-zinc-900 rounded-[40px] flex items-center justify-center mx-auto border border-white/5">
                        <Camera className="w-12 h-12 text-emerald-500" />
                      </div>
                      <div className="space-y-2">
                        <h2 className="text-2xl font-bold">Ready to Scan</h2>
                        <p className="text-zinc-500 text-sm">Take a photo of any question from your textbook or document.</p>
                      </div>
                      <button 
                        onClick={startCamera}
                        className="w-full bg-white text-black font-bold py-5 rounded-3xl hover:bg-zinc-200 transition-all active:scale-95 flex items-center justify-center gap-3"
                      >
                        <Camera className="w-6 h-6" />
                        Take Photo
                      </button>
                    </div>
                  )}

                  {isCameraActive && (
                    <div className="relative aspect-[3/4] bg-zinc-900 rounded-[40px] overflow-hidden border border-white/10">
                      <video 
                        ref={videoRef} 
                        autoPlay 
                        playsInline 
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute bottom-8 left-0 right-0 flex justify-center items-center gap-6">
                        <button 
                          onClick={stopCamera}
                          className="w-12 h-12 bg-black/50 backdrop-blur-md rounded-full flex items-center justify-center border border-white/10"
                        >
                          <X className="w-6 h-6" />
                        </button>
                        <button 
                          onClick={capturePhoto}
                          className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-2xl active:scale-90 transition-transform"
                        >
                          <div className="w-16 h-16 border-4 border-black rounded-full" />
                        </button>
                        <div className="w-12 h-12" /> {/* Spacer */}
                      </div>
                    </div>
                  )}

                  {capturedImage && (
                    <div className="space-y-6">
                      <div className="relative aspect-[3/4] bg-zinc-900 rounded-[40px] overflow-hidden border border-emerald-500/30">
                        <img src={capturedImage} alt="Captured" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                          <button 
                            onClick={() => { setCapturedImage(null); startCamera(); }}
                            className="bg-white/10 backdrop-blur-md text-white px-4 py-2 rounded-full text-xs font-bold border border-white/20 flex items-center gap-2"
                          >
                            <RefreshCw className="w-3 h-3" /> Retake
                          </button>
                        </div>
                      </div>

                      {isEditingOcr && (
                        <motion.div 
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="bg-zinc-900 border border-white/10 p-6 rounded-3xl space-y-4"
                        >
                          <div className="flex justify-between items-center">
                            <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500">Extracted Question</h3>
                            <span className="text-[10px] text-zinc-600 italic">Edit if needed</span>
                          </div>
                          <textarea 
                            value={ocrResult || ""}
                            onChange={(e) => setOcrResult(e.target.value)}
                            className="w-full bg-black border border-white/5 rounded-2xl p-4 text-sm focus:outline-none focus:border-emerald-500 transition-colors min-h-[100px]"
                          />
                          <button 
                            onClick={askQuestion}
                            disabled={loading || !ocrResult}
                            className="w-full bg-emerald-500 text-black font-bold py-4 rounded-2xl hover:bg-emerald-400 transition-colors flex items-center justify-center gap-2"
                          >
                            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowRight className="w-5 h-5" />}
                            Analyze Question
                          </button>
                        </motion.div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </main>

      {/* Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-xl border-t border-white/5 px-6 py-4">
        <div className="max-w-md mx-auto flex justify-between items-center">
          <NavButton 
            active={activeTab === 'ask'} 
            onClick={() => setActiveTab('ask')} 
            icon={<Camera className="w-5 h-5" />} 
            label="Ask" 
          />
          <NavButton 
            active={activeTab === 'history'} 
            onClick={() => setActiveTab('history')} 
            icon={<History className="w-5 h-5" />} 
            label="History" 
          />
          <NavButton 
            active={activeTab === 'admin'} 
            onClick={() => setActiveTab('admin')} 
            icon={<Settings className="w-5 h-5" />} 
            label="Admin" 
          />
        </div>
      </nav>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

const NavButton: React.FC<{ active: boolean; onClick: () => void; icon: React.ReactNode; label: string }> = ({ active, onClick, icon, label }) => (
  <button 
    onClick={onClick}
    className={cn(
      "flex flex-col items-center gap-1 transition-all duration-300",
      active ? "text-emerald-500 scale-110" : "text-zinc-500 hover:text-zinc-300"
    )}
  >
    <div className={cn(
      "p-2 rounded-xl transition-colors",
      active ? "bg-emerald-500/10" : "bg-transparent"
    )}>
      {icon}
    </div>
    <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
  </button>
);

export default App;
