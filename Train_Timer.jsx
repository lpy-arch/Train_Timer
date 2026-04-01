import { useState, useRef, useCallback, useEffect } from "react";

const TRACK_COLORS = [
  "#FF6B6B", "#4ECDC4", "#FFE66D", "#A78BFA",
  "#F472B6", "#34D399", "#FB923C", "#60A5FA",
  "#E879F9", "#2DD4BF", "#FBBF24", "#818CF8",
];

const DEFAULT_OPTIONS = ["热身", "训练", "组间休息", "拉伸"];

const formatTime = (ms) => {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const cs = Math.floor((ms % 1000) / 10);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
};

const formatTimeSec = (ms) => {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h${m}m${s}s`;
  if (m > 0) return `${m}m${s}s`;
  return `${s}s`;
};

const formatDate = (d) => {
  const dt = d || new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}/${pad(dt.getMonth() + 1)}/${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`;
};

// ─── Parse exported text ───
function parseTrainingText(text) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const segments = [];
  const optionSet = new Set();
  const timeRegex = /^\[(.+?)\s*→\s*(.+?)\]\s*(.+?)\s*\(/;
  // Try to extract memo
  let memo = "";
  const memoIdx = text.indexOf("--- 备忘录 ---");
  if (memoIdx !== -1) {
    const afterMemo = text.slice(memoIdx + "--- 备忘录 ---".length).trim();
    // memo goes until next --- or end
    const nextSection = afterMemo.indexOf("---");
    memo = nextSection !== -1 ? afterMemo.slice(0, nextSection).trim() : afterMemo.trim();
  }
  // Try to extract date
  let dateStr = "";
  const dateLine = lines.find((l) => l.startsWith("训练记录"));
  if (dateLine) dateStr = dateLine.replace("训练记录", "").replace("（导入）", "").trim();

  const parseTimeStr = (str) => {
    str = str.trim(); let total = 0;
    const hm = str.match(/(\d+)h/); if (hm) total += parseInt(hm[1]) * 3600000;
    const mm = str.match(/(\d+)m/); if (mm) total += parseInt(mm[1]) * 60000;
    const sm = str.match(/(\d+)s/); if (sm) total += parseInt(sm[1]) * 1000;
    return total;
  };

  for (const line of lines) {
    const m = line.match(timeRegex);
    if (m) {
      const start = parseTimeStr(m[1]); const end = parseTimeStr(m[2]); const label = m[3].trim();
      segments.push({ start, end, label }); optionSet.add(label);
    }
  }
  if (segments.length === 0) return null;
  const options = [...optionSet];
  const totalDuration = Math.max(...segments.map((s) => s.end));
  return { segments, options, totalDuration, memo, dateStr };
}

// ─── Draw full pianoroll image with header + stats + memo ───
function drawPianoroll(segments, options, totalDuration, width, dateStr, memo) {
  const TRACK_H = 48;
  const LABEL_W = 100;
  const TOP_BAR = 36;
  const PADDING_R = 20;
  const PADDING_X = 16;
  const displayW = Math.max(width, 400);
  const timelineW = displayW - LABEL_W - PADDING_R;
  const scale = 3;

  // Compute stats for sizing
  const stats = options.map((opt, i) => {
    const total = segments.filter((s) => s.label === opt).reduce((sum, s) => sum + (s.end - s.start), 0);
    const pct = ((total / totalDuration) * 100).toFixed(1);
    return { label: opt, total, pct, color: TRACK_COLORS[i % TRACK_COLORS.length] };
  }).filter((s) => s.total > 0);

  // Header area
  const HEADER_H = 56;
  // Piano area
  const pianoTop = HEADER_H;
  const pianoH = TOP_BAR + options.length * TRACK_H + 12;
  // Stats area
  const STAT_LINE_H = 24;
  const STAT_TOP_PAD = 16;
  const STAT_BOT_PAD = 12;
  const statsH = STAT_TOP_PAD + stats.length * STAT_LINE_H + STAT_BOT_PAD;
  // Memo area
  let memoLines = [];
  let memoH = 0;
  if (memo && memo.trim()) {
    // Wrap memo text manually
    const rawLines = memo.split("\n");
    const maxCharsPerLine = Math.floor((displayW - PADDING_X * 2) / 8); // approx monospace 12px
    rawLines.forEach((rl) => {
      if (rl.length === 0) { memoLines.push(""); return; }
      let cur = rl;
      while (cur.length > maxCharsPerLine) {
        memoLines.push(cur.slice(0, maxCharsPerLine));
        cur = cur.slice(maxCharsPerLine);
      }
      memoLines.push(cur);
    });
    memoH = 16 + 20 + memoLines.length * 18 + 12; // pad + title + lines + pad
  }

  const canvasH = HEADER_H + pianoH + statsH + memoH + 8;

  const canvas = document.createElement("canvas");
  canvas.width = displayW * scale;
  canvas.height = canvasH * scale;
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);

  // Full BG
  ctx.fillStyle = "#1a1a2e";
  ctx.fillRect(0, 0, displayW, canvasH);

  // ── Header ──
  ctx.fillStyle = "#fff";
  ctx.font = "bold 16px monospace";
  ctx.textAlign = "left";
  ctx.fillText("训练记录", PADDING_X, 28);
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.font = "12px monospace";
  ctx.fillText(dateStr || formatDate(), PADDING_X, 46);
  // Total duration right-aligned
  ctx.fillStyle = "#4ECDC4";
  ctx.font = "bold 14px monospace";
  ctx.textAlign = "right";
  ctx.fillText(`总时长 ${formatTimeSec(totalDuration)}`, displayW - PADDING_X, 28);

  // Divider
  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PADDING_X, HEADER_H - 4); ctx.lineTo(displayW - PADDING_X, HEADER_H - 4); ctx.stroke();

  // ── Pianoroll ──
  const pY = pianoTop;
  const dur = totalDuration || 1;
  const stepOptions = [5000, 10000, 15000, 30000, 60000, 120000, 300000, 600000];
  let gridStep = stepOptions.find((s) => timelineW / (dur / s) >= 40) || 600000;

  ctx.strokeStyle = "rgba(255,255,255,0.07)";
  ctx.lineWidth = 1;
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.font = "10px monospace";
  ctx.textAlign = "center";

  for (let t = 0; t <= dur; t += gridStep) {
    const x = LABEL_W + (t / dur) * timelineW;
    ctx.beginPath(); ctx.moveTo(x, pY + TOP_BAR); ctx.lineTo(x, pY + TOP_BAR + options.length * TRACK_H); ctx.stroke();
    ctx.fillText(formatTimeSec(t), x, pY + TOP_BAR - 8);
  }

  options.forEach((opt, i) => {
    const y = pY + TOP_BAR + i * TRACK_H;
    const color = TRACK_COLORS[i % TRACK_COLORS.length];
    if (i % 2 === 0) { ctx.fillStyle = "rgba(255,255,255,0.02)"; ctx.fillRect(LABEL_W, y, timelineW, TRACK_H); }
    ctx.strokeStyle = "rgba(255,255,255,0.06)"; ctx.beginPath(); ctx.moveTo(LABEL_W, y + TRACK_H); ctx.lineTo(displayW - PADDING_R, y + TRACK_H); ctx.stroke();
    ctx.fillStyle = color; ctx.font = "bold 12px monospace"; ctx.textAlign = "right";
    ctx.fillText(opt.length > 10 ? opt.slice(0, 9) + "…" : opt, LABEL_W - 10, y + TRACK_H / 2 + 4);
  });

  segments.forEach((seg) => {
    const trackIdx = options.indexOf(seg.label);
    if (trackIdx === -1) return;
    const y = pY + TOP_BAR + trackIdx * TRACK_H + 6;
    const x = LABEL_W + (seg.start / dur) * timelineW;
    const w = Math.max(((seg.end - seg.start) / dur) * timelineW, 2);
    const h = TRACK_H - 12;
    const color = TRACK_COLORS[trackIdx % TRACK_COLORS.length];
    const r = Math.min(4, w / 2);
    ctx.fillStyle = color + "CC"; ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill();
    ctx.fillStyle = color; ctx.fillRect(x, y, w, 2);
    if (w > 40) { ctx.fillStyle = "#1a1a2e"; ctx.font = "bold 10px monospace"; ctx.textAlign = "left"; ctx.fillText(formatTimeSec(seg.end - seg.start), x + 5, y + h / 2 + 3); }
  });

  ctx.strokeStyle = "rgba(255,255,255,0.15)"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(LABEL_W, pY + TOP_BAR); ctx.lineTo(LABEL_W, pY + TOP_BAR + options.length * TRACK_H); ctx.stroke();

  // ── Stats ──
  const sY = pianoTop + pianoH;
  ctx.strokeStyle = "rgba(255,255,255,0.1)"; ctx.beginPath(); ctx.moveTo(PADDING_X, sY); ctx.lineTo(displayW - PADDING_X, sY); ctx.stroke();

  stats.forEach((st, i) => {
    const ly = sY + STAT_TOP_PAD + i * STAT_LINE_H;
    // Color dot
    ctx.fillStyle = st.color;
    ctx.fillRect(PADDING_X, ly + 2, 10, 10);
    // Label
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.font = "12px monospace";
    ctx.textAlign = "left";
    ctx.fillText(st.label, PADDING_X + 18, ly + 12);
    // Time + pct
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.textAlign = "right";
    ctx.fillText(`${formatTimeSec(st.total)}  (${st.pct}%)`, displayW - PADDING_X, ly + 12);
    // Mini bar
    const barW = (st.total / totalDuration) * (displayW - PADDING_X * 2 - 200);
    ctx.fillStyle = st.color + "30";
    ctx.fillRect(PADDING_X + 100, ly + 15, Math.max(barW, 2), 4);
    ctx.fillStyle = st.color + "90";
    ctx.fillRect(PADDING_X + 100, ly + 15, Math.max(barW, 2), 4);
  });

  // ── Memo ──
  if (memoH > 0) {
    const mY = sY + statsH;
    ctx.strokeStyle = "rgba(255,255,255,0.1)"; ctx.beginPath(); ctx.moveTo(PADDING_X, mY); ctx.lineTo(displayW - PADDING_X, mY); ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = "bold 12px monospace";
    ctx.textAlign = "left";
    ctx.fillText("备忘录", PADDING_X, mY + 28);
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = "12px monospace";
    memoLines.forEach((line, i) => {
      ctx.fillText(line, PADDING_X, mY + 28 + 20 + i * 18);
    });
  }

  return canvas.toDataURL("image/png");
}

// ─── Pianoroll View ───
function PianorollView({ segments, options, totalDuration, onBack, onSaveText, dateStr, memo }) {
  const [imgSrc, setImgSrc] = useState(null);
  const [toast, setToast] = useState("");
  const [showSaveModal, setShowSaveModal] = useState(false);

  useEffect(() => {
    if (segments.length > 0) {
      const src = drawPianoroll(segments, options, totalDuration, window.innerWidth - 16, dateStr, memo);
      setImgSrc(src);
    }
  }, [segments, options, totalDuration, dateStr, memo]);

  const handleSaveImage = () => { if (imgSrc) setShowSaveModal(true); };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#0f0f1a" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.08)", flexWrap: "wrap", gap: 8 }}>
        <button onClick={onBack} style={pillBtn}>← 返回</button>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={handleSaveImage} style={pillBtn}>保存图片</button>
          <button onClick={onSaveText} style={pillBtn}>复制文本</button>
        </div>
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: "12px 8px" }}>
        {imgSrc && <img src={imgSrc} style={{ width: "100%", borderRadius: 8 }} alt="pianoroll" />}
      </div>
      {toast && <div style={toastStyle}>{toast}</div>}
      {showSaveModal && (
        <div onClick={() => setShowSaveModal(false)} style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          zIndex: 300, padding: 20, gap: 16,
        }}>
          <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, fontFamily: "monospace", textAlign: "center" }}>长按图片 → 保存到相册</div>
          <img src={imgSrc} onClick={(e) => e.stopPropagation()} style={{ width: "95%", maxWidth: 600, borderRadius: 8 }} alt="pianoroll" />
          <button onClick={() => setShowSaveModal(false)} style={{ ...pillBtn, padding: "10px 24px", fontSize: 13, marginTop: 8 }}>关闭</button>
        </div>
      )}
    </div>
  );
}

// ─── Import View ───
function ImportView({ onBack }) {
  const [inputText, setInputText] = useState("");
  const [parsed, setParsed] = useState(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const handleParse = () => {
    const result = parseTrainingText(inputText);
    if (result) { setParsed(result); setError(""); }
    else { setError("无法解析，请粘贴由本应用导出的文本记录"); setParsed(null); }
  };

  if (parsed) {
    const handleCopy = () => {
      let txt = `训练记录 ${parsed.dateStr || ""}\n总时长: ${formatTimeSec(parsed.totalDuration)}\n\n--- 时间线 ---\n`;
      parsed.segments.forEach((s) => { txt += `[${formatTimeSec(s.start)} → ${formatTimeSec(s.end)}] ${s.label} (${formatTimeSec(s.end - s.start)})\n`; });
      if (parsed.memo) txt += `\n--- 备忘录 ---\n${parsed.memo}\n`;
      navigator.clipboard.writeText(txt).then(() => { setToast("已复制"); setTimeout(() => setToast(""), 2000); });
    };
    return (
      <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
        <PianorollView segments={parsed.segments} options={parsed.options} totalDuration={parsed.totalDuration} onBack={() => setParsed(null)} onSaveText={handleCopy} dateStr={parsed.dateStr} memo={parsed.memo} />
        {toast && <div style={toastStyle}>{toast}</div>}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#0f0f1a", color: "#fff", fontFamily: "'SF Mono', 'Fira Code', monospace" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <button onClick={onBack} style={pillBtn}>← 返回</button>
        <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: 1, color: "rgba(255,255,255,0.6)" }}>导入记录</span>
      </div>
      <div style={{ flex: 1, padding: 16, display: "flex", flexDirection: "column", gap: 12, overflow: "hidden" }}>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", flexShrink: 0 }}>粘贴之前导出的训练文本记录，生成可视化</div>
        <textarea value={inputText} onChange={(e) => setInputText(e.target.value)}
          placeholder={"粘贴文本记录...\n\n格式示例:\n[0s → 1m30s] 热身 (1m30s)\n[1m30s → 5m0s] 训练 (3m30s)"}
          style={{ flex: 1, minHeight: 0, width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, color: "#fff", padding: 14, fontSize: 13, fontFamily: "inherit", resize: "none", outline: "none", boxSizing: "border-box", lineHeight: 1.6 }}
        />
        {error && <div style={{ color: "#FF6B6B", fontSize: 12, flexShrink: 0 }}>{error}</div>}
        <button onClick={handleParse} style={{ ...pillBtn, flexShrink: 0, padding: "12px 20px", fontSize: 14, textAlign: "center", background: "rgba(78,205,196,0.12)", color: "#4ECDC4", border: "1px solid rgba(78,205,196,0.3)", borderRadius: 12 }}>
          生成可视化
        </button>
      </div>
    </div>
  );
}

// ─── RM Calculator View ───
const RM_TABLE = [
  { rm: 1, coeff: 1.000 },
  { rm: 2, coeff: 0.943 },
  { rm: 3, coeff: 0.906 },
  { rm: 4, coeff: 0.881 },
  { rm: 5, coeff: 0.856 },
  { rm: 6, coeff: 0.831 },
  { rm: 7, coeff: 0.807 },
  { rm: 8, coeff: 0.786 },
  { rm: 9, coeff: 0.765 },
  { rm: 10, coeff: 0.744 },
];

function RMCalculatorView({ onBack }) {
  const [selectedRM, setSelectedRM] = useState(5);
  const [weight, setWeight] = useState("");

  const weightNum = parseFloat(weight);
  const hasResult = !isNaN(weightNum) && weightNum > 0;
  const selectedCoeff = RM_TABLE.find((r) => r.rm === selectedRM)?.coeff || 1;
  const estimated1RM = hasResult ? weightNum / selectedCoeff : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#0f0f1a", color: "#fff", fontFamily: "'SF Mono', 'Fira Code', monospace" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <button onClick={onBack} style={pillBtn}>← 返回</button>
        <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: 1, color: "rgba(255,255,255,0.6)" }}>RM 换算</span>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
        {/* RM selector */}
        <div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 8 }}>选择 RM</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {RM_TABLE.map((r) => (
              <button key={r.rm} onClick={() => setSelectedRM(r.rm)} style={{
                ...pillBtn, padding: "8px 14px", fontSize: 14, minWidth: 44, textAlign: "center",
                ...(selectedRM === r.rm ? { background: "rgba(78,205,196,0.15)", color: "#4ECDC4", border: "1px solid rgba(78,205,196,0.3)" } : {}),
              }}>
                {r.rm}
              </button>
            ))}
          </div>
        </div>

        {/* Weight input */}
        <div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 8 }}>输入重量 (kg)</div>
          <input type="number" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="例如 60"
            style={{
              width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 10, color: "#fff", padding: 14, fontSize: 16, fontFamily: "inherit", outline: "none", boxSizing: "border-box",
            }}
          />
        </div>

        {/* Result info */}
        {hasResult && (
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", padding: "4px 0" }}>
            基于 {selectedRM}RM = {weightNum}kg，推算 1RM ≈ {estimated1RM.toFixed(1)}kg
          </div>
        )}

        {/* Conversion table */}
        {hasResult && (
          <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, overflow: "hidden" }}>
            {/* Table header */}
            <div style={{
              display: "flex", padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,0.08)",
              fontSize: 11, color: "rgba(255,255,255,0.4)", fontWeight: 700,
            }}>
              <span style={{ flex: 1 }}>RM</span>
              <span style={{ flex: 1, textAlign: "center" }}>系数</span>
              <span style={{ flex: 1, textAlign: "right" }}>重量 (kg)</span>
            </div>
            {/* Table rows */}
            {RM_TABLE.map((r) => {
              const w = estimated1RM * r.coeff;
              const isSelected = r.rm === selectedRM;
              return (
                <div key={r.rm} style={{
                  display: "flex", alignItems: "center", padding: "10px 16px",
                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                  background: isSelected ? "rgba(78,205,196,0.08)" : "transparent",
                }}>
                  <span style={{ flex: 1, fontSize: 14, fontWeight: isSelected ? 700 : 500, color: isSelected ? "#4ECDC4" : "rgba(255,255,255,0.7)" }}>
                    {r.rm}RM
                  </span>
                  <span style={{ flex: 1, textAlign: "center", fontSize: 12, color: "rgba(255,255,255,0.35)" }}>
                    {r.coeff.toFixed(3)}
                  </span>
                  <span style={{ flex: 1, textAlign: "right", fontSize: 15, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: isSelected ? "#4ECDC4" : "#fff" }}>
                    {w.toFixed(1)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main App ───
export default function TrainingTimer() {
  const [options, setOptions] = useState(() => {
    try { const s = localStorage.getItem("tt_options"); return s ? JSON.parse(s) : DEFAULT_OPTIONS; } catch { return DEFAULT_OPTIONS; }
  });
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [running, setRunning] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [elapsed, setElapsed] = useState(0);
  const [segments, setSegments] = useState([]);
  const [startTime, setStartTime] = useState(null);
  const [segStart, setSegStart] = useState(null);
  const [stopProgress, setStopProgress] = useState(0);
  const stopStartRef = useRef(null);
  const stopRafRef = useRef(null);
  const [showResult, setShowResult] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showRMCalc, setShowRMCalc] = useState(false);
  const [showMemo, setShowMemo] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [memo, setMemo] = useState("");
  const [finalSegments, setFinalSegments] = useState([]);
  const [finalOptions, setFinalOptions] = useState([]);
  const [finalDuration, setFinalDuration] = useState(0);
  const [finalDate, setFinalDate] = useState("");
  const [finalMemo, setFinalMemo] = useState("");
  const [toast, setToast] = useState("");
  const [now, setNow] = useState(Date.now());

  useEffect(() => { try { localStorage.setItem("tt_options", JSON.stringify(options)); } catch {} }, [options]);

  useEffect(() => {
    if (running && startTime) {
      const id = setInterval(() => { const n = Date.now(); setElapsed(n - startTime); setNow(n); }, 50);
      return () => clearInterval(id);
    }
  }, [running, startTime]);

  const accumulatedTimes = {};
  if (running) {
    options.forEach((opt) => { accumulatedTimes[opt] = 0; });
    segments.forEach((seg) => { accumulatedTimes[seg.label] = (accumulatedTimes[seg.label] || 0) + (seg.end - seg.start); });
  }

  const handleStart = (idx) => {
    const n = Date.now();
    if (!running) {
      setRunning(true); setStartTime(n); setSegStart(n); setActiveIdx(idx); setSegments([]); setElapsed(0);
    } else {
      if (idx === activeIdx) return;
      setSegments((prev) => [...prev, { label: options[activeIdx], start: segStart - startTime, end: n - startTime }]);
      setSegStart(n); setActiveIdx(idx);
    }
  };

  const finishSession = () => {
    const n = Date.now();
    const allSegs = [...segments, { label: options[activeIdx], start: segStart - startTime, end: n - startTime }];
    const dateStr = formatDate(new Date());
    setFinalSegments(allSegs); setFinalOptions([...options]); setFinalDuration(n - startTime); setFinalDate(dateStr); setFinalMemo(memo);
    setRunning(false); setActiveIdx(-1); setElapsed(0); setStartTime(null); setSegStart(null); setSegments([]); setShowResult(true);
    // Don't clear memo until next session starts
  };

  const handleStopDown = (e) => {
    e.preventDefault(); stopStartRef.current = Date.now(); setStopProgress(0);
    const animate = () => {
      const p = Math.min((Date.now() - stopStartRef.current) / 3000, 1);
      setStopProgress(p);
      if (p >= 1) { finishSession(); setStopProgress(0); return; }
      stopRafRef.current = requestAnimationFrame(animate);
    };
    stopRafRef.current = requestAnimationFrame(animate);
  };
  const handleStopUp = () => { if (stopRafRef.current) cancelAnimationFrame(stopRafRef.current); setStopProgress(0); };

  const openEdit = () => { setEditText(options.join("\n")); setEditing(true); };
  const saveEdit = () => { const n = editText.split("\n").map((s) => s.trim()).filter(Boolean); if (n.length > 0) setOptions(n); setEditing(false); };

  const generateText = () => {
    let txt = `训练记录 ${finalDate}\n总时长: ${formatTimeSec(finalDuration)}\n\n--- 时间线 ---\n`;
    finalSegments.forEach((s) => { txt += `[${formatTimeSec(s.start)} → ${formatTimeSec(s.end)}] ${s.label} (${formatTimeSec(s.end - s.start)})\n`; });
    txt += `\n--- 统计 ---\n`;
    finalOptions.forEach((opt) => {
      const total = finalSegments.filter((s) => s.label === opt).reduce((sum, s) => sum + (s.end - s.start), 0);
      if (total > 0) txt += `${opt}: ${formatTimeSec(total)} (${((total / finalDuration) * 100).toFixed(1)}%)\n`;
    });
    if (finalMemo && finalMemo.trim()) txt += `\n--- 备忘录 ---\n${finalMemo}\n`;
    return txt;
  };

  const handleSaveText = () => {
    navigator.clipboard.writeText(generateText()).then(() => { setToast("已复制到剪贴板"); setTimeout(() => setToast(""), 2000); }).catch(() => { setToast("复制失败"); setTimeout(() => setToast(""), 2000); });
  };

  if (showImport) return <div style={{ height: "100vh", fontFamily: "'SF Mono', 'Fira Code', monospace" }}><ImportView onBack={() => setShowImport(false)} /></div>;

  if (showRMCalc) return <div style={{ height: "100vh", fontFamily: "'SF Mono', 'Fira Code', monospace" }}><RMCalculatorView onBack={() => setShowRMCalc(false)} /></div>;

  if (showResult) {
    return (
      <div style={{ height: "100vh", display: "flex", flexDirection: "column", fontFamily: "'SF Mono', 'Fira Code', monospace" }}>
        <PianorollView segments={finalSegments} options={finalOptions} totalDuration={finalDuration} onBack={() => { setShowResult(false); setMemo(""); }} onSaveText={handleSaveText} dateStr={finalDate} memo={finalMemo} />
        {toast && <div style={toastStyle}>{toast}</div>}
      </div>
    );
  }

  // Memo indicator
  const hasMemo = memo.trim().length > 0;

  return (
    <div style={{
      height: "100vh", display: "flex", flexDirection: "column",
      background: "#0f0f1a", color: "#fff",
      fontFamily: "'SF Mono', 'Fira Code', monospace",
      userSelect: "none", WebkitUserSelect: "none", overflow: "auto",
    }}>
      {/* Top bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: 2, color: "rgba(255,255,255,0.6)" }}>TRAINER</span>
        <div style={{ display: "flex", gap: 8, position: "relative" }}>
          <button onClick={() => setShowMemo(true)} style={{ ...pillBtn, position: "relative" }}>
            备忘录
            {hasMemo && <div style={{ position: "absolute", top: -3, right: -3, width: 7, height: 7, borderRadius: "50%", background: "#4ECDC4" }} />}
          </button>
          <button onClick={() => setShowMore((v) => !v)} style={{ ...pillBtn, ...(showMore ? { background: "rgba(78,205,196,0.15)", color: "#4ECDC4", border: "1px solid rgba(78,205,196,0.3)" } : {}) }}>
            更多 {showMore ? "▲" : "▼"}
          </button>
          {showMore && (
            <div style={{
              position: "absolute", top: "100%", right: 0, marginTop: 6, zIndex: 50,
              background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10,
              overflow: "hidden", minWidth: 120,
            }}>
              <button onClick={() => { setShowRMCalc(true); setShowMore(false); }}
                style={{ display: "block", width: "100%", padding: "10px 16px", background: "transparent", border: "none", borderBottom: "1px solid rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.7)", fontSize: 13, fontFamily: "inherit", fontWeight: 600, cursor: "pointer", textAlign: "left" }}>
                RM换算
              </button>
              {!running && <button onClick={() => { setShowImport(true); setShowMore(false); }}
                style={{ display: "block", width: "100%", padding: "10px 16px", background: "transparent", border: "none", borderBottom: "1px solid rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.7)", fontSize: 13, fontFamily: "inherit", fontWeight: 600, cursor: "pointer", textAlign: "left" }}>
                导入
              </button>}
              {!running && <button onClick={() => { openEdit(); setShowMore(false); }}
                style={{ display: "block", width: "100%", padding: "10px 16px", background: "transparent", border: "none", color: "rgba(255,255,255,0.7)", fontSize: 13, fontFamily: "inherit", fontWeight: 600, cursor: "pointer", textAlign: "left" }}>
                编辑选项
              </button>}
            </div>
          )}
        </div>
      </div>

      {/* Clock */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "28px 0 16px" }}>
        <div style={{
          fontSize: 52, fontWeight: 200, letterSpacing: 4, fontVariantNumeric: "tabular-nums",
          color: running ? "#fff" : "rgba(255,255,255,0.3)", transition: "color 0.3s",
        }}>
          {formatTime(elapsed)}
        </div>
        {running && activeIdx >= 0 && (
          <div style={{
            marginTop: 8, fontSize: 14, fontWeight: 600, letterSpacing: 1,
            color: TRACK_COLORS[activeIdx % TRACK_COLORS.length],
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: TRACK_COLORS[activeIdx % TRACK_COLORS.length], animation: "pulse 1.2s infinite" }} />
            {options[activeIdx]}
          </div>
        )}
      </div>

      {/* Option buttons */}
      <div style={{ flex: 1, overflow: "auto", padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
        {options.map((opt, i) => {
          const isActive = running && activeIdx === i;
          const color = TRACK_COLORS[i % TRACK_COLORS.length];
          const currentSegTime = isActive && segStart ? now - segStart : 0;
          const totalAccum = (accumulatedTimes[opt] || 0) + (isActive ? currentSegTime : 0);
          const hasTime = running && totalAccum > 0;
          return (
            <button key={i} onClick={() => handleStart(i)} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "14px 18px",
              background: isActive ? color + "18" : "rgba(255,255,255,0.03)",
              border: isActive ? `1.5px solid ${color}60` : "1.5px solid rgba(255,255,255,0.06)",
              borderRadius: 12, color: isActive ? color : "rgba(255,255,255,0.7)",
              fontSize: 15, fontWeight: isActive ? 700 : 500,
              cursor: "pointer", transition: "all 0.2s", fontFamily: "inherit",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: isActive ? color : color + "40", transition: "background 0.2s" }} />
                {opt}
              </div>
              {hasTime && (
                <span style={{ fontSize: 12, opacity: 0.8, fontVariantNumeric: "tabular-nums", display: "flex", gap: 4, alignItems: "center", color: isActive ? color : "rgba(255,255,255,0.5)" }}>
                  {isActive && <span>{formatTimeSec(currentSegTime)}</span>}
                  {isActive && <span style={{ opacity: 0.4 }}>:</span>}
                  <span style={{ opacity: isActive ? 0.7 : 1 }}>{formatTimeSec(totalAccum)}</span>
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Stop button */}
      {running && (
        <div style={{ padding: "16px", borderTop: "1px solid rgba(255,255,255,0.08)", display: "flex", justifyContent: "center" }}>
          <div onPointerDown={handleStopDown} onPointerUp={handleStopUp} onPointerLeave={handleStopUp} onPointerCancel={handleStopUp}
            style={{
              position: "relative", width: "100%", maxWidth: 300, height: 52, borderRadius: 26,
              background: "rgba(255,59,48,0.1)", border: "1.5px solid rgba(255,59,48,0.3)",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", overflow: "hidden", touchAction: "none",
            }}>
            <div style={{
              position: "absolute", left: 0, top: 0, bottom: 0, width: `${stopProgress * 100}%`,
              background: "rgba(255,59,48,0.25)", transition: stopProgress === 0 ? "width 0.15s" : "none", borderRadius: 26,
            }} />
            <span style={{
              position: "relative", zIndex: 1, color: stopProgress > 0.5 ? "#FF3B30" : "rgba(255,59,48,0.7)",
              fontSize: 13, fontWeight: 700, letterSpacing: 1, transition: "color 0.2s",
            }}>
              {stopProgress > 0 ? `松开取消 · ${Math.ceil(3 - stopProgress * 3)}s` : "长按 3 秒结束"}
            </span>
          </div>
        </div>
      )}

      {/* Mini timeline */}
      {running && segments.length > 0 && (
        <div style={{ padding: "0 16px 12px", display: "flex", gap: 2, height: 8 }}>
          {segments.map((seg, i) => {
            const color = TRACK_COLORS[options.indexOf(seg.label) % TRACK_COLORS.length];
            const pct = ((seg.end - seg.start) / elapsed) * 100;
            return <div key={i} style={{ height: "100%", borderRadius: 2, background: color + "AA", flex: `${pct} 0 0%`, minWidth: 2 }} />;
          })}
          {activeIdx >= 0 && <div style={{ height: "100%", borderRadius: 2, background: TRACK_COLORS[activeIdx % TRACK_COLORS.length], flex: `${((now - segStart) / elapsed) * 100} 0 0%`, minWidth: 2 }} />}
        </div>
      )}

      {/* Edit Modal */}
      {editing && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 }}>
          <div style={{ background: "#1a1a2e", borderRadius: 16, padding: 24, width: "100%", maxWidth: 360, border: "1px solid rgba(255,255,255,0.1)" }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: "#fff" }}>编辑选项</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 12 }}>每行一个选项</div>
            <textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={6}
              style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff", padding: 12, fontSize: 14, fontFamily: "inherit", resize: "vertical", outline: "none", boxSizing: "border-box" }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
              <button onClick={() => setEditing(false)} style={{ ...pillBtn, padding: "8px 20px" }}>取消</button>
              <button onClick={saveEdit} style={{ ...pillBtn, padding: "8px 20px", background: "rgba(78,205,196,0.15)", color: "#4ECDC4", border: "1px solid rgba(78,205,196,0.3)" }}>保存</button>
            </div>
          </div>
        </div>
      )}

      {/* Memo Modal */}
      {showMemo && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 }}>
          <div style={{ background: "#1a1a2e", borderRadius: 16, padding: 24, width: "100%", maxWidth: 360, border: "1px solid rgba(255,255,255,0.1)" }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6, color: "#fff" }}>备忘录</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 12 }}>训练笔记，结束后会包含在导出内容中</div>
            <textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={8} placeholder="记录训练组数、重量、感受..."
              style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff", padding: 12, fontSize: 14, fontFamily: "inherit", resize: "vertical", outline: "none", boxSizing: "border-box", lineHeight: 1.6 }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
              <button onClick={() => setShowMemo(false)} style={{ ...pillBtn, padding: "8px 20px", background: "rgba(78,205,196,0.15)", color: "#4ECDC4", border: "1px solid rgba(78,205,196,0.3)" }}>完成</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div style={toastStyle}>{toast}</div>}
      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } } * { -webkit-tap-highlight-color: transparent; }`}</style>
    </div>
  );
}

const pillBtn = {
  background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8, color: "rgba(255,255,255,0.6)", fontSize: 12,
  padding: "6px 14px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600,
};

const toastStyle = {
  position: "fixed", bottom: 80, left: "50%", transform: "translateX(-50%)",
  background: "rgba(255,255,255,0.12)", backdropFilter: "blur(10px)",
  color: "#fff", padding: "8px 20px", borderRadius: 20,
  fontSize: 13, fontWeight: 500, zIndex: 200, border: "1px solid rgba(255,255,255,0.1)",
};
