/** AXE File Analysis Client — upload, preview, and analyze files. */

import { api } from "./api";

const API = process.env.REACT_APP_BACKEND_URL
  ? `${process.env.REACT_APP_BACKEND_URL}/api`
  : "/api";

/**
 * Upload and analyze a file via the backend.
 * @param {File} file - The file to analyze
 * @param {string} action - Analysis action (auto, summarize, describe, review, ocr, explain)
 * @param {string} sessionId - Optional session ID
 * @returns {Promise<object>} Analysis result
 */
export async function analyzeFile(file, action = "auto", sessionId = null) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("action", action);
  if (sessionId) formData.append("session_id", sessionId);

  const res = await api.post("/files/analyze", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
}

/**
 * Analyze source code without uploading a file.
 * @param {string} code - Source code string
 * @param {string} filename - File name for language detection
 * @param {string} language - Programming language
 * @param {string} action - Analysis action (review, explain, fix, document)
 * @param {string} sessionId - Optional session ID
 * @returns {Promise<object>} Analysis result
 */
export async function analyzeCode(code, filename, language = "auto", action = "review", sessionId = null) {
  const res = await api.post("/files/analyze/code", {
    code,
    filename,
    language,
    action,
    session_id: sessionId,
  });
  return res.data;
}

/**
 * Detect file type from extension and content type.
 * @param {File} file
 * @returns {string} File type category
 */
export function detectFileType(file) {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  const contentType = file.type || "";

  const imageExts = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "tiff", "svg", "ico"];
  const codeExts = [
    "py", "js", "ts", "jsx", "tsx", "html", "css", "java", "c", "cpp", "cs",
    "go", "rs", "rb", "php", "swift", "kt", "sh", "bash", "ps1", "lua", "r",
    "m", "sql", "yaml", "yml", "json", "xml", "md", "txt", "log",
  ];
  const pdfExts = ["pdf"];
  const docExts = ["docx", "doc", "odt", "rtf"];
  const sheetExts = ["csv", "xlsx", "xls", "ods"];
  const archiveExts = ["zip", "rar", "tar", "gz", "7z", "bz2"];

  if (imageExts.includes(ext) || contentType.startsWith("image/")) return "image";
  if (codeExts.includes(ext)) return "code";
  if (pdfExts.includes(ext) || contentType === "application/pdf") return "pdf";
  if (docExts.includes(ext)) return "document";
  if (sheetExts.includes(ext)) return "spreadsheet";
  if (archiveExts.includes(ext)) return "archive";
  if (contentType.startsWith("text/")) return "code";
  return "unknown";
}

/**
 * Get a human-readable file size string.
 * @param {number} bytes
 * @returns {string}
 */
export function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

/**
 * Read a file as text (for code/text preview).
 * @param {File} file
 * @returns {Promise<string>}
 */
export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

/**
 * Read a file as data URL (for image preview).
 * @param {File} file
 * @returns {Promise<string>}
 */
export function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Get a preview for a file (text or image data URL).
 * @param {File} file
 * @returns {Promise<{preview: string, type: string}>}
 */
export async function getFilePreview(file) {
  const type = detectFileType(file);
  if (type === "image") {
    const dataUrl = await readFileAsDataURL(file);
    return { preview: dataUrl, type };
  }
  if (type === "code" || type === "pdf" || type === "text") {
    const text = await readFileAsText(file);
    const truncated = text.length > 5000 ? text.slice(0, 5000) + "\n...[truncated]" : text;
    return { preview: truncated, type };
  }
  return { preview: `[${formatFileSize(file.size)} ${type.toUpperCase()} file]`, type };
}

/**
 * Suggest an analysis action based on file type.
 * @param {string} fileType
 * @returns {string}
 */
export function suggestAction(fileType) {
  switch (fileType) {
    case "image": return "describe";
    case "pdf": return "summarize";
    case "code": return "review";
    case "document": return "summarize";
    case "spreadsheet": return "analyze";
    default: return "auto";
  }
}
