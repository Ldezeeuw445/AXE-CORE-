import React, { useState, useRef } from "react";
import { FileUp, X, FileText, Image, Code, Loader2, CheckCircle } from "lucide-react";
import {
  analyzeFile,
  detectFileType,
  formatFileSize,
  getFilePreview,
  suggestAction,
} from "../../lib/fileAnalysis";

export function FileUploadZone({ onUpload, onError, onClose, disabled }) {
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [action, setAction] = useState("auto");
  const inputRef = useRef(null);

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };
  const handleDragLeave = (e) => {
    e.preventDefault();
    setDragOver(false);
  };
  const handleDrop = async (e) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.[0]) {
      await loadFile(e.dataTransfer.files[0]);
    }
  };

  const loadFile = async (f) => {
    setFile(f);
    const p = await getFilePreview(f);
    setPreview(p);
    setAction(suggestAction(p.type));
  };

  const handleFileChange = async (e) => {
    if (e.target.files?.[0]) {
      await loadFile(e.target.files[0]);
    }
  };

  const handleAnalyze = async () => {
    if (!file) return;
    try {
      setAnalyzing(true);
      const result = await analyzeFile(file, action);
      onUpload(result);
    } catch (e) {
      onError(e?.message || "File analysis failed");
    } finally {
      setAnalyzing(false);
    }
  };

  const clearFile = () => {
    setFile(null);
    setPreview(null);
    setAction("auto");
  };

  const fileType = file ? detectFileType(file) : "unknown";
  const typeIcon = {
    image: <Image size={16} className="text-[#66E6FF]" />,
    code: <Code size={16} className="text-[#2EF2C2]" />,
    pdf: <FileText size={16} className="text-[#FFCC66]" />,
  }[fileType] || <FileText size={16} className="text-[#9FB0C0]" />;

  const actions = [
    { value: "auto", label: "Auto" },
    { value: "summarize", label: "Summarize" },
    { value: "describe", label: "Describe" },
    { value: "review", label: "Review" },
    { value: "explain", label: "Explain" },
    { value: "ocr", label: "OCR" },
  ];

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex flex-col gap-3 p-4"
        style={{
          width: "min(90vw, 480px)",
          background: "#0B0C0E",
          border: "1px solid rgba(0,212,255,0.25)",
          borderRadius: 16,
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileUp size={16} className="text-[#66E6FF]" />
            <span className="text-[11px] font-semibold tracking-[0.10em] text-[#EAF2F7]">FILE ANALYSIS</span>
          </div>
          <button onClick={onClose} className="text-[#6F8193] hover:text-[#FF4D6D] p-1">
            <X size={14} />
          </button>
        </div>

        {!file ? (
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className="flex flex-col items-center justify-center gap-2 p-6 cursor-pointer"
            style={{
              border: dragOver
                ? "2px dashed rgba(0,212,255,0.6)"
                : "2px dashed rgba(255,255,255,0.1)",
              borderRadius: 8,
              background: dragOver ? "rgba(0,212,255,0.05)" : "transparent",
              transition: "all 140ms ease",
            }}
          >
            <FileUp size={24} className="text-[#6F8193]" />
            <span className="text-[10px] text-[#9FB0C0] text-center">
              Drop a file here or click to browse
              <br />
              Images, PDFs, code files
            </span>
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              onChange={handleFileChange}
              accept="image/*,.pdf,.txt,.md,.js,.ts,.jsx,.tsx,.py,.html,.css,.json,.xml,.csv"
            />
          </div>
        ) : (
          <>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-white/3 border border-white/5">
              <div className="mt-0.5">{typeIcon}</div>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] text-[#EAF2F7] truncate">{file.name}</div>
                <div className="text-[9px] text-[#6F8193]">
                  {formatFileSize(file.size)} · {fileType.toUpperCase()}
                </div>
              </div>
              <button onClick={clearFile} className="text-[#6F8193] hover:text-[#FF4D6D] p-1">
                <X size={12} />
              </button>
            </div>

            {preview?.type === "image" && (
              <img
                src={preview.preview}
                alt="preview"
                className="w-full rounded-lg border border-white/5"
                style={{ maxHeight: 200, objectFit: "contain" }}
              />
            )}
            {preview?.type === "code" && (
              <pre className="w-full p-2 rounded-lg bg-black/50 border border-white/5 text-[10px] text-[#9FB0C0] overflow-auto"
                style={{ maxHeight: 160 }}
              >
                <code>{preview.preview}</code>
              </pre>
            )}

            <div className="flex items-center gap-2">
              <span className="text-[9px] text-[#6F8193] uppercase tracking-wider">Action:</span>
              <select
                value={action}
                onChange={(e) => setAction(e.target.value)}
                className="axe-input text-[10px] py-1 flex-1"
              >
                {actions.map((a) => (
                  <option key={a.value} value={a.value}>{a.label}</option>
                ))}
              </select>
            </div>

            <button
              onClick={handleAnalyze}
              disabled={analyzing || disabled}
              className="w-full inline-flex items-center justify-center gap-1 px-3 py-2 rounded-md bg-[#00D4FF] text-black text-[11px] font-semibold hover:bg-[#66E6FF] transition-colors disabled:opacity-60"
            >
              {analyzing ? (
                <>
                  <Loader2 size={12} className="animate-spin" /> ANALYZING...
                </>
              ) : (
                <>
                  <CheckCircle size={12} /> ANALYZE FILE
                </>
              )}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
