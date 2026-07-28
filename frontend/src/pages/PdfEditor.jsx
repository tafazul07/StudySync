import { useState, useRef, useEffect, useCallback } from 'react';
import {
  FileEdit, Upload, Download, ZoomIn, ZoomOut, ChevronLeft,
  ChevronRight, Highlighter, StickyNote, Trash2, RotateCcw, FileText,
  Pencil, Type, X, Check, AlertCircle, MousePointer2, Square,
  ArrowUpRight, Eraser, Maximize, RotateCw
} from 'lucide-react';
import { useVoiceAction } from '../hooks/useVoiceControl';

let pdfjs = null;

async function getPdfJs() {
  if (pdfjs) return pdfjs;
  const mod = await import('pdfjs-dist');
  mod.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${mod.version}/build/pdf.worker.min.mjs`;
  pdfjs = mod;
  return pdfjs;
}

const HIGHLIGHT_COLORS = [
  { name: 'Yellow', value: 'rgba(253,224,71,0.5)', solid: '#fde047' },
  { name: 'Green', value: 'rgba(74,222,128,0.5)', solid: '#4ade80' },
  { name: 'Blue', value: 'rgba(96,165,250,0.5)', solid: '#60a5fa' },
  { name: 'Pink', value: 'rgba(249,168,212,0.5)', solid: '#f9a8d4' },
];

const BRUSH_SIZES = [
  { id: 'sm', label: 'S', value: 2 },
  { id: 'md', label: 'M', value: 4 },
  { id: 'lg', label: 'L', value: 8 },
];

const TOOLS = [
  { id: 'select', label: 'Select', icon: MousePointer2, key: 'v' },
  { id: 'highlight', label: 'Highlight', icon: Highlighter, key: 'h' },
  { id: 'draw', label: 'Draw', icon: Pencil, key: 'd' },
  { id: 'rect', label: 'Rectangle', icon: Square, key: 'r' },
  { id: 'arrow', label: 'Arrow', icon: ArrowUpRight, key: 'a' },
  { id: 'text', label: 'Text', icon: Type, key: 't' },
  { id: 'note', label: 'Note', icon: StickyNote, key: 'n' },
  { id: 'eraser', label: 'Eraser', icon: Eraser, key: 'e' },
];

// Distance from point to line segment (for eraser hit detection on arrows)
function pointToLineDistance(px, py, x1, y1, x2, y2) {
  const A = px - x1, B = py - y1, C = x2 - x1, D = y2 - y1;
  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let param = lenSq !== 0 ? dot / lenSq : -1;
  let xx, yy;
  if (param < 0) { xx = x1; yy = y1; }
  else if (param > 1) { xx = x2; yy = y2; }
  else { xx = x1 + param * C; yy = y1 + param * D; }
  return Math.sqrt((px - xx) ** 2 + (py - yy) ** 2);
}

export default function PdfEditor() {
  const [pdfDoc, setPdfDoc] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1.2);
  const [rotation, setRotation] = useState(0);
  const [activeTool, setActiveTool] = useState('select');
  const [highlightColor, setHighlightColor] = useState(HIGHLIGHT_COLORS[0]);
  const [brushSize, setBrushSize] = useState(BRUSH_SIZES[1]);
  const [annotations, setAnnotations] = useState({});
  const [activeNote, setActiveNote] = useState(null);
  const [noteInput, setNoteInput] = useState('');
  const [textInput, setTextInput] = useState({ active: false, x: 0, y: 0, value: '' });
  const [fileName, setFileName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawPath, setDrawPath] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [saveIndicator, setSaveIndicator] = useState(false);

  const canvasRef = useRef(null);
  const overlayRef = useRef(null);
  const fileInputRef = useRef(null);
  const pdfBytesRef = useRef(null);
  const renderTaskRef = useRef(null);
  const viewportRef = useRef(null);
  const shapeStartRef = useRef(null);
  const scrollRef = useRef(null);

  // Voice action for upload
  useVoiceAction('upload', (data) => {
    if (!data.targetRoute || data.targetRoute === '/pdf-editor') {
      fileInputRef.current?.click();
    }
  });

  // Handle pending voice upload from navigation
  useEffect(() => {
    const pendingUpload = sessionStorage.getItem('pendingVoiceUpload');
    if (pendingUpload) {
      try {
        const data = JSON.parse(pendingUpload);
        if (!data.targetRoute || data.targetRoute === '/pdf-editor') {
          setTimeout(() => fileInputRef.current?.click(), 100);
        }
        sessionStorage.removeItem('pendingVoiceUpload');
      } catch (e) {
        sessionStorage.removeItem('pendingVoiceUpload');
      }
    }
  }, []);

  // === Render PDF page ===
  const renderPage = useCallback(async (doc, pageNum, s, rot) => {
    if (!doc || !canvasRef.current) return;
    if (renderTaskRef.current) { try { renderTaskRef.current.cancel(); } catch {} }
    const page = await doc.getPage(pageNum);
    const viewport = page.getViewport({ scale: s, rotation: rot });
    viewportRef.current = viewport;
    const canvas = canvasRef.current;
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    if (overlayRef.current) {
      overlayRef.current.width = viewport.width;
      overlayRef.current.height = viewport.height;
      overlayRef.current.style.width = `${viewport.width}px`;
      overlayRef.current.style.height = `${viewport.height}px`;
    }
    const ctx = canvas.getContext('2d');
    try {
      const task = page.render({ canvasContext: ctx, viewport });
      renderTaskRef.current = task;
      await task.promise;
      renderAnnotations(pageNum, viewport);
    } catch (err) {
      if (err?.name !== 'RenderingCancelledException') console.error('Render error:', err);
    }
  }, []);

  // === Render annotations on overlay ===
  const renderAnnotations = useCallback((pageNum, viewport, preview) => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext('2d');
    const s = viewport?.scale || scale;
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    const pageAnns = annotations[pageNum] || [];
    for (const ann of pageAnns) {
      if (ann.type === 'highlight' && ann.rects) {
        ctx.fillStyle = ann.color;
        for (const r of ann.rects) ctx.fillRect(r.x * s, r.y * s, r.w * s, r.h * s);
      }
      if (ann.type === 'draw' && ann.path) {
        ctx.strokeStyle = ann.color;
        ctx.lineWidth = (ann.lineWidth || 2) * s;
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.beginPath();
        ann.path.forEach((pt, i) => i === 0 ? ctx.moveTo(pt.x * s, pt.y * s) : ctx.lineTo(pt.x * s, pt.y * s));
        ctx.stroke();
      }
      if (ann.type === 'shape' && ann.shape === 'rect') {
        ctx.strokeStyle = ann.color;
        ctx.lineWidth = (ann.lineWidth || 2) * s;
        ctx.strokeRect(ann.x * s, ann.y * s, ann.w * s, ann.h * s);
      }
      if (ann.type === 'shape' && ann.shape === 'arrow') {
        ctx.strokeStyle = ann.color;
        ctx.lineWidth = (ann.lineWidth || 2) * s;
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        const x1 = ann.x1 * s, y1 = ann.y1 * s, x2 = ann.x2 * s, y2 = ann.y2 * s;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const headLen = (10 + (ann.lineWidth || 2) * 2) * s;
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
        ctx.stroke();
      }
      if (ann.type === 'text') {
        ctx.fillStyle = ann.color || '#1e40af';
        ctx.font = `bold ${14 * s}px Inter, sans-serif`;
        ctx.fillText(ann.text, ann.x * s, ann.y * s);
      }
    }

    // In-progress freehand drawing (raw coords, not normalized)
    if (isDrawing && drawPath.length > 1) {
      ctx.strokeStyle = highlightColor.solid;
      ctx.lineWidth = brushSize.value;
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.beginPath();
      drawPath.forEach((pt, i) => i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y));
      ctx.stroke();
    }

    // Shape preview (raw coords)
    if (preview) {
      ctx.strokeStyle = preview.color;
      ctx.lineWidth = preview.lineWidth;
      ctx.setLineDash([5, 3]);
      if (preview.type === 'rect') {
        const x = Math.min(preview.start.x, preview.end.x);
        const y = Math.min(preview.start.y, preview.end.y);
        ctx.strokeRect(x, y, Math.abs(preview.end.x - preview.start.x), Math.abs(preview.end.y - preview.start.y));
      } else if (preview.type === 'arrow') {
        ctx.beginPath(); ctx.moveTo(preview.start.x, preview.start.y); ctx.lineTo(preview.end.x, preview.end.y); ctx.stroke();
        const angle = Math.atan2(preview.end.y - preview.start.y, preview.end.x - preview.start.x);
        const headLen = 10 + preview.lineWidth * 2;
        ctx.beginPath();
        ctx.moveTo(preview.end.x, preview.end.y);
        ctx.lineTo(preview.end.x - headLen * Math.cos(angle - Math.PI / 6), preview.end.y - headLen * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(preview.end.x, preview.end.y);
        ctx.lineTo(preview.end.x - headLen * Math.cos(angle + Math.PI / 6), preview.end.y - headLen * Math.sin(angle + Math.PI / 6));
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
  }, [annotations, isDrawing, drawPath, highlightColor, brushSize, scale]);

  // === Effects ===
  useEffect(() => { if (pdfDoc) renderPage(pdfDoc, currentPage, scale, rotation); }, [pdfDoc, currentPage, scale, rotation, renderPage]);

  useEffect(() => {
    if (pdfDoc && canvasRef.current) {
      pdfDoc.getPage(currentPage).then(page => {
        const vp = page.getViewport({ scale, rotation });
        viewportRef.current = vp;
        renderAnnotations(currentPage, vp);
      });
    }
  }, [annotations, pdfDoc, currentPage, scale, rotation, renderAnnotations]);

  // Auto-save annotations to localStorage
  useEffect(() => {
    if (fileName && Object.keys(annotations).length > 0) {
      localStorage.setItem(`pdf-ann-${fileName}`, JSON.stringify(annotations));
      setSaveIndicator(true);
      const t = setTimeout(() => setSaveIndicator(false), 1500);
      return () => clearTimeout(t);
    }
  }, [annotations, fileName]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e) => {
      if (!pdfDoc) return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); setCurrentPage(p => Math.max(1, p - 1)); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); setCurrentPage(p => Math.min(totalPages, p + 1)); }
      else if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undoAnnotation(); }
      else if (e.key === 'Escape') { setActiveTool('select'); setActiveNote(null); setTextInput({ active: false, x: 0, y: 0, value: '' }); shapeStartRef.current = null; }
      else if (e.key === '+' || e.key === '=') { e.preventDefault(); setScale(s => Math.min(3, +(s + 0.2).toFixed(1))); }
      else if (e.key === '-') { e.preventDefault(); setScale(s => Math.max(0.5, +(s - 0.2).toFixed(1))); }
      else if (e.key === '0') { e.preventDefault(); setScale(1.2); }
      else {
        const tool = TOOLS.find(t => t.key === e.key.toLowerCase());
        if (tool) setActiveTool(tool.id);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [pdfDoc, totalPages, annotations, currentPage]);

  // === File upload (with drag-drop) ===
  const loadPdfFile = async (file) => {
    if (!file || file.type !== 'application/pdf') { setError('Please upload a valid PDF file.'); return; }
    setError(''); setLoading(true); setAnnotations({}); setCurrentPage(1); setRotation(0);
    try {
      const bytes = await file.arrayBuffer();
      pdfBytesRef.current = bytes;
      setFileName(file.name);
      const lib = await getPdfJs();
      const doc = await lib.getDocument({ data: bytes }).promise;
      setPdfDoc(doc);
      setTotalPages(doc.numPages);
      // Load saved annotations
      const saved = localStorage.getItem(`pdf-ann-${file.name}`);
      if (saved) { try { setAnnotations(JSON.parse(saved)); } catch {} }
    } catch (err) {
      setError('Failed to load PDF: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (file) await loadPdfFile(file);
  };

  const handleDrop = async (e) => {
    e.preventDefault(); setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) await loadPdfFile(file);
  };

  // === Navigation ===
  const prevPage = () => setCurrentPage(p => Math.max(1, p - 1));
  const nextPage = () => setCurrentPage(p => Math.min(totalPages, p + 1));
  const jumpToPage = (val) => { const n = parseInt(val); if (n >= 1 && n <= totalPages) setCurrentPage(n); };
  const zoomIn = () => setScale(s => Math.min(3, +(s + 0.2).toFixed(1)));
  const zoomOut = () => setScale(s => Math.max(0.5, +(s - 0.2).toFixed(1)));
  const rotate = () => setRotation(r => (r + 90) % 360);
  const fitToWidth = async () => {
    if (!pdfDoc || !scrollRef.current) return;
    const page = await pdfDoc.getPage(currentPage);
    const vp = page.getViewport({ scale: 1, rotation });
    const cw = scrollRef.current.clientWidth - 32;
    setScale(+(cw / vp.width).toFixed(2));
  };
  const handleWheel = (e) => {
    if (e.ctrlKey) { e.preventDefault(); e.deltaY < 0 ? zoomIn() : zoomOut(); }
  };

  // === Annotation helpers ===
  const addAnnotation = (ann) => {
    setAnnotations(prev => ({ ...prev, [currentPage]: [...(prev[currentPage] || []), { id: Date.now() + Math.random(), page: currentPage, ...ann }] }));
  };
  const deleteAnnotation = (pageNum, id) => {
    setAnnotations(prev => ({ ...prev, [pageNum]: (prev[pageNum] || []).filter(a => a.id !== id) }));
  };
  const clearPageAnnotations = () => {
    if (!confirm('Clear all annotations on this page?')) return;
    setAnnotations(prev => ({ ...prev, [currentPage]: [] }));
  };
  const clearAllAnnotations = () => {
    if (!confirm('Clear all annotations from the entire document?')) return;
    setAnnotations({});
  };
  const undoAnnotation = () => {
    setAnnotations(prev => { const a = [...(prev[currentPage] || [])]; a.pop(); return { ...prev, [currentPage]: a }; });
  };

  // === Eraser — hit detection for all annotation types ===
  const handleErase = (pos) => {
    const pageAnns = annotations[currentPage] || [];
    for (const ann of pageAnns) {
      if (ann.type === 'note') {
        if (Math.sqrt((pos.x - ann.x * scale) ** 2 + (pos.y - ann.y * scale) ** 2) < 30) { deleteAnnotation(currentPage, ann.id); return; }
      } else if (ann.type === 'text') {
        if (Math.abs(pos.x - ann.x * scale) < 60 && Math.abs(pos.y - ann.y * scale) < 20) { deleteAnnotation(currentPage, ann.id); return; }
      } else if (ann.type === 'highlight' && ann.rects) {
        for (const r of ann.rects) {
          if (pos.x >= r.x * scale && pos.x <= (r.x + r.w) * scale && pos.y >= r.y * scale && pos.y <= (r.y + r.h) * scale) { deleteAnnotation(currentPage, ann.id); return; }
        }
      } else if (ann.type === 'draw' && ann.path) {
        for (const pt of ann.path) {
          if (Math.sqrt((pos.x - pt.x * scale) ** 2 + (pos.y - pt.y * scale) ** 2) < 12) { deleteAnnotation(currentPage, ann.id); return; }
        }
      } else if (ann.type === 'shape' && ann.shape === 'rect') {
        if (pos.x >= ann.x * scale && pos.x <= (ann.x + ann.w) * scale && pos.y >= ann.y * scale && pos.y <= (ann.y + ann.h) * scale) { deleteAnnotation(currentPage, ann.id); return; }
      } else if (ann.type === 'shape' && ann.shape === 'arrow') {
        if (pointToLineDistance(pos.x, pos.y, ann.x1 * scale, ann.y1 * scale, ann.x2 * scale, ann.y2 * scale) < 12) { deleteAnnotation(currentPage, ann.id); return; }
      }
    }
  };

  // === Mouse handlers ===
  const getPos = (e) => {
    const rect = overlayRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handleOverlayMouseDown = (e) => {
    if (!pdfDoc) return;
    const pos = getPos(e);
    if (activeTool === 'draw') { setIsDrawing(true); setDrawPath([pos]); }
    else if (activeTool === 'rect' || activeTool === 'arrow') { shapeStartRef.current = pos; }
    else if (activeTool === 'note') { setActiveNote({ x: pos.x, y: pos.y, page: currentPage }); setNoteInput(''); }
    else if (activeTool === 'text') { setTextInput({ active: true, x: pos.x, y: pos.y, value: '' }); }
    else if (activeTool === 'eraser') { handleErase(pos); }
  };

  const handleOverlayMouseMove = (e) => {
    if (!pdfDoc) return;
    const pos = getPos(e);
    if (activeTool === 'draw' && isDrawing) {
      setDrawPath(prev => [...prev, pos]);
      const overlay = overlayRef.current;
      if (overlay && drawPath.length > 0) {
        const ctx = overlay.getContext('2d');
        ctx.strokeStyle = highlightColor.solid; ctx.lineWidth = brushSize.value;
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(drawPath[drawPath.length - 1].x, drawPath[drawPath.length - 1].y);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
      }
    } else if ((activeTool === 'rect' || activeTool === 'arrow') && shapeStartRef.current) {
      if (viewportRef.current) {
        renderAnnotations(currentPage, viewportRef.current, { type: activeTool, start: shapeStartRef.current, end: pos, color: highlightColor.solid, lineWidth: brushSize.value });
      }
    }
  };

  const handleOverlayMouseUp = (e) => {
    if (activeTool === 'draw' && isDrawing) {
      if (drawPath.length > 1) {
        addAnnotation({ type: 'draw', path: drawPath.map(p => ({ x: p.x / scale, y: p.y / scale })), color: highlightColor.solid, lineWidth: brushSize.value });
      }
      setIsDrawing(false); setDrawPath([]);
    } else if ((activeTool === 'rect' || activeTool === 'arrow') && shapeStartRef.current) {
      const pos = getPos(e);
      const start = shapeStartRef.current;
      if (Math.abs(pos.x - start.x) > 3 || Math.abs(pos.y - start.y) > 3) {
        if (activeTool === 'rect') {
          addAnnotation({ type: 'shape', shape: 'rect', x: Math.min(start.x, pos.x) / scale, y: Math.min(start.y, pos.y) / scale, w: Math.abs(pos.x - start.x) / scale, h: Math.abs(pos.y - start.y) / scale, color: highlightColor.solid, lineWidth: brushSize.value });
        } else {
          addAnnotation({ type: 'shape', shape: 'arrow', x1: start.x / scale, y1: start.y / scale, x2: pos.x / scale, y2: pos.y / scale, color: highlightColor.solid, lineWidth: brushSize.value });
        }
      }
      shapeStartRef.current = null;
      if (viewportRef.current) renderAnnotations(currentPage, viewportRef.current);
    }
  };

  // Selection-based highlight
  const handleMouseUp = (e) => {
    if (activeTool !== 'highlight') return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    const rects = Array.from(range.getClientRects());
    const canvasRect = canvasRef.current?.getBoundingClientRect();
    if (!canvasRect || rects.length === 0) return;
    const normalized = rects.map(r => ({ x: (r.left - canvasRect.left) / scale, y: (r.top - canvasRect.top) / scale, w: r.width / scale, h: r.height / scale }));
    addAnnotation({ type: 'highlight', rects: normalized, color: highlightColor.value });
    selection.removeAllRanges();
  };

  // Export page as PNG (merged PDF + annotations)
  const handleDownload = () => {
    if (!canvasRef.current) return;
    const merged = document.createElement('canvas');
    merged.width = canvasRef.current.width;
    merged.height = canvasRef.current.height;
    const ctx = merged.getContext('2d');
    ctx.drawImage(canvasRef.current, 0, 0);
    if (overlayRef.current) ctx.drawImage(overlayRef.current, 0, 0);
    merged.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `annotated_${fileName || 'page'}_${currentPage}.png`;
      a.click(); URL.revokeObjectURL(url);
    });
  };

  const totalAnnotations = Object.values(annotations).flat().length;
  const pageAnnotations = annotations[currentPage] || [];

  const cursorStyle = activeTool === 'draw' ? 'crosshair' : activeTool === 'highlight' ? 'text' : activeTool === 'eraser' ? 'pointer' : (activeTool === 'note' || activeTool === 'text' || activeTool === 'rect' || activeTool === 'arrow') ? 'crosshair' : 'default';

  return (
    <div className="space-y-4 animate-fade-in h-full">
      {/* Top bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-sky-500 to-blue-500 rounded-xl blur-lg opacity-40" />
            <div className="relative bg-gradient-to-br from-sky-500 to-blue-600 p-2.5 rounded-xl">
              <FileEdit className="w-5 h-5 text-white" />
            </div>
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">PDF Editor</h1>
            <div className="flex items-center gap-2">
              {fileName && <p className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-48">{fileName}</p>}
              {saveIndicator && <span className="text-[10px] text-emerald-500 font-medium animate-fade-in">✓ Saved</span>}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => fileInputRef.current?.click()} className="btn-secondary flex items-center gap-2 !py-2 !px-4">
            <Upload className="w-4 h-4" />{pdfDoc ? 'Change PDF' : 'Upload PDF'}
          </button>
          {pdfDoc && (
            <>
              <button onClick={undoAnnotation} disabled={pageAnnotations.length === 0} className="btn-secondary flex items-center gap-2 !py-2 !px-4 disabled:opacity-40" title="Undo (Ctrl+Z)">
                <RotateCcw className="w-4 h-4" />Undo
              </button>
              <button onClick={clearPageAnnotations} disabled={pageAnnotations.length === 0} className="btn-secondary flex items-center gap-2 !py-2 !px-4 disabled:opacity-40" title="Clear current page">
                <Trash2 className="w-4 h-4" />Clear Page
              </button>
              <button onClick={clearAllAnnotations} disabled={totalAnnotations === 0} className="btn-secondary flex items-center gap-2 !py-2 !px-4 disabled:opacity-40" title="Clear all">
                <X className="w-4 h-4" />Clear All
              </button>
              <button onClick={handleDownload} className="btn-primary flex items-center gap-2 !py-2 !px-4">
                <Download className="w-4 h-4" />Export Page
              </button>
            </>
          )}
          <input ref={fileInputRef} type="file" accept=".pdf" onChange={handleFileUpload} className="hidden" />
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400">
          <AlertCircle className="w-5 h-5 flex-shrink-0" /><p className="text-sm">{error}</p>
        </div>
      )}

      {!pdfDoc ? (
        <div
          className={`glass rounded-2xl p-16 text-center border-2 border-dashed transition-colors cursor-pointer ${isDragging ? 'border-sky-500 bg-sky-500/5 scale-[1.01]' : 'border-gray-300 dark:border-gray-700 hover:border-sky-400 dark:hover:border-sky-500'}`}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          {loading ? (
            <div className="flex flex-col items-center gap-4">
              <div className="w-12 h-12 border-4 border-sky-500/30 border-t-sky-500 rounded-full animate-spin" />
              <p className="text-gray-500 dark:text-gray-400">Processing PDF...</p>
            </div>
          ) : (
            <>
              <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-sky-500/10 to-blue-500/10 rounded-2xl flex items-center justify-center">
                <FileText className="w-10 h-10 text-sky-500" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">{isDragging ? 'Drop to upload' : 'Drop a PDF here'}</h2>
              <p className="text-gray-500 dark:text-gray-400 mb-6">or click to browse files</p>
              <button className="btn-primary flex items-center gap-2 mx-auto">
                <Upload className="w-4 h-4" />Upload PDF
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="flex gap-4 h-[calc(100vh-180px)]">
          {/* Left toolbar */}
          <div className="flex flex-col gap-2 w-14">
            <div className="glass rounded-xl p-2 flex flex-col gap-2">
              {TOOLS.map((tool) => {
                const Icon = tool.icon;
                return (
                  <button
                    key={tool.id}
                    title={`${tool.label} (${tool.key.toUpperCase()})`}
                    onClick={() => setActiveTool(tool.id)}
                    className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${activeTool === tool.id ? 'bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-lg shadow-sky-500/30' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                  >
                    <Icon className="w-4 h-4" />
                  </button>
                );
              })}
            </div>

            {/* Color picker */}
            {(activeTool === 'highlight' || activeTool === 'draw' || activeTool === 'rect' || activeTool === 'arrow' || activeTool === 'text') && (
              <div className="glass rounded-xl p-2 flex flex-col gap-1.5">
                {HIGHLIGHT_COLORS.map((c) => (
                  <button key={c.name} title={c.name} onClick={() => setHighlightColor(c)}
                    className={`w-10 h-10 rounded-lg transition-all ${highlightColor.name === c.name ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : 'hover:scale-105'}`}
                    style={{ backgroundColor: c.solid }} />
                ))}
              </div>
            )}

            {/* Brush size */}
            {(activeTool === 'draw' || activeTool === 'rect' || activeTool === 'arrow') && (
              <div className="glass rounded-xl p-2 flex flex-col gap-1.5">
                {BRUSH_SIZES.map((b) => (
                  <button key={b.id} title={`${b.label} (${b.value}px)`} onClick={() => setBrushSize(b)}
                    className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold transition-all ${brushSize.id === b.id ? 'bg-sky-500 text-white' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
                    {b.label}
                  </button>
                ))}
              </div>
            )}

            {/* Annotation count */}
            {totalAnnotations > 0 && (
              <div className="glass rounded-xl p-2 text-center">
                <div className="text-lg font-bold text-sky-600 dark:text-sky-400">{totalAnnotations}</div>
                <div className="text-[10px] text-gray-500 dark:text-gray-400 leading-tight">marks</div>
              </div>
            )}
          </div>

          {/* Main viewer */}
          <div className="flex-1 flex flex-col gap-3 min-w-0">
            {/* Controls bar */}
            <div className="glass rounded-xl px-4 py-2 flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <button onClick={prevPage} disabled={currentPage <= 1} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40 transition-all" title="Previous (←)">
                  <ChevronLeft className="w-5 h-5 text-gray-700 dark:text-gray-300" />
                </button>
                <div className="flex items-center gap-1">
                  <input
                    type="number" value={currentPage} min="1" max={totalPages}
                    onChange={(e) => jumpToPage(e.target.value)}
                    className="w-12 px-1 py-0.5 text-center text-sm font-semibold rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 outline-none focus:border-sky-500"
                  />
                  <span className="text-sm text-gray-500 dark:text-gray-400">/ {totalPages}</span>
                </div>
                <button onClick={nextPage} disabled={currentPage >= totalPages} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40 transition-all" title="Next (→)">
                  <ChevronRight className="w-5 h-5 text-gray-700 dark:text-gray-300" />
                </button>
              </div>

              <div className="flex items-center gap-1">
                <button onClick={zoomOut} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-all" title="Zoom out (-)">
                  <ZoomOut className="w-4 h-4 text-gray-700 dark:text-gray-300" />
                </button>
                <span className="text-xs text-gray-500 dark:text-gray-400 font-mono min-w-12 text-center">{Math.round(scale * 100)}%</span>
                <button onClick={zoomIn} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-all" title="Zoom in (+)">
                  <ZoomIn className="w-4 h-4 text-gray-700 dark:text-gray-300" />
                </button>
                <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />
                <button onClick={fitToWidth} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-all" title="Fit to width">
                  <Maximize className="w-4 h-4 text-gray-700 dark:text-gray-300" />
                </button>
                <button onClick={rotate} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-all" title="Rotate 90°">
                  <RotateCw className="w-4 h-4 text-gray-700 dark:text-gray-300" />
                </button>
                {rotation !== 0 && <span className="text-xs text-sky-500 font-mono">{rotation}°</span>}
              </div>

              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${activeTool === 'select' ? 'bg-gray-400' : 'bg-sky-500 animate-pulse'}`} />
                <span className="text-xs font-medium text-gray-600 dark:text-gray-400 capitalize">{activeTool} mode</span>
                <span className="text-[10px] text-gray-400 dark:text-gray-500 hidden md:inline">← → navigate · Ctrl+Z undo · {TOOLS.find(t => t.id === activeTool)?.key.toUpperCase()} tool</span>
              </div>
            </div>

            {/* Canvas area */}
            <div ref={scrollRef} onWheel={handleWheel} className="flex-1 overflow-auto glass rounded-xl">
              <div className="min-h-full flex items-start justify-center p-4">
                {loading ? (
                  <div className="flex items-center justify-center h-64">
                    <div className="w-12 h-12 border-4 border-sky-500/30 border-t-sky-500 rounded-full animate-spin" />
                  </div>
                ) : (
                  <div className="relative shadow-2xl" onMouseUp={handleMouseUp}>
                    <canvas ref={canvasRef} className="block" />
                    <canvas
                      ref={overlayRef}
                      className="absolute top-0 left-0"
                      style={{ cursor: cursorStyle }}
                      onMouseDown={handleOverlayMouseDown}
                      onMouseMove={handleOverlayMouseMove}
                      onMouseUp={handleOverlayMouseUp}
                    />

                    {/* Sticky note input */}
                    {activeNote && (
                      <div className="absolute z-10 animate-scale-in" style={{ left: activeNote.x, top: activeNote.y }}>
                        <div className="bg-yellow-300 dark:bg-yellow-400 rounded-lg shadow-xl p-3 w-52">
                          <textarea autoFocus value={noteInput} onChange={(e) => setNoteInput(e.target.value)} placeholder="Type your note..." rows={3}
                            className="w-full bg-transparent text-gray-800 text-sm resize-none outline-none placeholder-yellow-600"
                            onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey && noteInput.trim()) { addAnnotation({ type: 'note', x: activeNote.x / scale, y: activeNote.y / scale, text: noteInput.trim(), color: '#fde047' }); setActiveNote(null); } }}
                          />
                          <div className="flex gap-2 mt-2 justify-end">
                            <button onClick={() => setActiveNote(null)} className="p-1 rounded hover:bg-yellow-400 transition-colors"><X className="w-4 h-4 text-gray-700" /></button>
                            <button onClick={() => { if (noteInput.trim()) { addAnnotation({ type: 'note', x: activeNote.x / scale, y: activeNote.y / scale, text: noteInput.trim(), color: '#fde047' }); } setActiveNote(null); }} className="p-1 rounded hover:bg-yellow-400 transition-colors"><Check className="w-4 h-4 text-gray-700" /></button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Text input */}
                    {textInput.active && (
                      <input
                        autoFocus type="text" value={textInput.value}
                        onChange={(e) => setTextInput({ ...textInput, value: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && textInput.value.trim()) {
                            addAnnotation({ type: 'text', x: textInput.x / scale, y: textInput.y / scale, text: textInput.value.trim(), color: highlightColor.solid });
                            setTextInput({ active: false, x: 0, y: 0, value: '' });
                          }
                          if (e.key === 'Escape') setTextInput({ active: false, x: 0, y: 0, value: '' });
                        }}
                        onBlur={() => { if (textInput.value.trim()) { addAnnotation({ type: 'text', x: textInput.x / scale, y: textInput.y / scale, text: textInput.value.trim(), color: highlightColor.solid }); } setTextInput({ active: false, x: 0, y: 0, value: '' }); }}
                        className="absolute z-10 px-2 py-1 text-sm bg-white dark:bg-gray-800 border-2 border-sky-500 rounded outline-none text-gray-900 dark:text-gray-100 shadow-lg"
                        style={{ left: textInput.x, top: textInput.y, fontSize: `${14 * scale}px`, color: highlightColor.solid, minWidth: '100px' }}
                        placeholder="Type and press Enter..."
                      />
                    )}

                    {/* Sticky note markers */}
                    {pageAnnotations.filter(a => a.type === 'note').map(ann => (
                      <div key={ann.id} className="absolute group cursor-pointer" style={{ left: ann.x * scale - 12, top: ann.y * scale - 12 }} title={ann.text}>
                        <div className="w-6 h-6 bg-yellow-400 rounded-full flex items-center justify-center shadow-md group-hover:scale-125 transition-transform">
                          <StickyNote className="w-3 h-3 text-yellow-800" />
                        </div>
                        <div className="absolute z-20 bottom-8 left-0 hidden group-hover:block bg-yellow-300 text-gray-800 text-xs rounded-lg p-2 shadow-xl w-40 whitespace-pre-wrap">
                          {ann.text}
                          <button onClick={() => deleteAnnotation(currentPage, ann.id)} className="block mt-1 text-red-600 hover:underline">Remove</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right panel — annotations list */}
          {pageAnnotations.length > 0 && (
            <div className="w-56 flex-shrink-0 glass rounded-xl p-3 overflow-y-auto max-h-full">
              <h3 className="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-3">
                Page {currentPage} ({pageAnnotations.length})
              </h3>
              <div className="space-y-2">
                {pageAnnotations.map((ann) => (
                  <div key={ann.id} className="flex items-start gap-2 p-2 rounded-lg bg-gray-50 dark:bg-gray-800/50 group">
                    <div className="w-4 h-4 mt-0.5 flex-shrink-0 rounded" style={{ backgroundColor: ann.color || '#6366f1' }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-gray-700 dark:text-gray-300 capitalize">{ann.type === 'shape' ? ann.shape : ann.type}</div>
                      {ann.text && <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{ann.text}</div>}
                    </div>
                    <button onClick={() => deleteAnnotation(currentPage, ann.id)} className="opacity-0 group-hover:opacity-100 transition-opacity">
                      <Trash2 className="w-3.5 h-3.5 text-red-500" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
