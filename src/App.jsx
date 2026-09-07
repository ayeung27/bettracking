import { useState, useEffect, useMemo } from "react";

// ── helpers ──────────────────────────────────────────────────────────────────
const americanToImplied = (odds) => {
  const o = Number(odds);
  if (o > 0) return 100 / (o + 100);
  return Math.abs(o) / (Math.abs(o) + 100);
};

const americanToProfit = (odds, stake) => {
  const o = Number(odds);
  const s = Number(stake);
  if (o > 0) return (o / 100) * s;
  return (100 / Math.abs(o)) * s;
};

const calcEV = (yourOdds, fairOdds, stake) => {
  const winProb = americanToImplied(fairOdds);
  const lossProb = 1 - winProb;
  const profit = americanToProfit(yourOdds, stake);
  return (winProb * profit) - (lossProb * Number(stake));
};

const calcNetPL = (bets) =>
  bets.reduce((acc, b) => {
    if (b.result === "win") return acc + americanToProfit(b.odds, b.stake);
    if (b.result === "loss") return acc - Number(b.stake);
    return acc; // push/pending: no change
  }, 0);

const calcWinRate = (bets) => {
  const settled = bets.filter((b) => b.result === "win" || b.result === "loss");
  if (!settled.length) return null;
  return (bets.filter((b) => b.result === "win").length / settled.length) * 100;
};

const fmtMoney = (n) =>
  (n >= 0 ? "+" : "") + "$" + Math.abs(n).toFixed(2);

const fmtOdds = (o) => {
  const n = Number(o);
  return n > 0 ? `+${n}` : `${n}`;
};

const uid = () => Math.random().toString(36).slice(2, 10);

const SPORTS = ["NFL", "NBA", "MLB"];
const BET_TYPES = ["Moneyline", "Spread", "Over/Under", "Prop", "Parlay", "Futures"];
const BOOKS = ["DraftKings", "FanDuel", "BetMGM", "Caesars", "ESPN Bet", "PointsBet", "Other"];
const RESULTS = ["pending", "win", "loss", "push"];

// ── storage ──────────────────────────────────────────────────────────────────
const STORAGE_KEY = "sharptrack_bets_v1";
const loadBets = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
};
const saveBets = (bets) => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(bets)); } catch {}
};

// ── validation ───────────────────────────────────────────────────────────────
const validateOdds = (val) => {
  const n = Number(val);
  if (isNaN(n) || val === "" || val === "-") return false;
  if (n === 0 || (n > -100 && n < 100 && n !== 0)) return false; // no odds between -99 and +99 except 0
  return true;
};

const isValidForm = (f) =>
  f.sport && f.betType && f.book && f.description.trim() &&
  validateOdds(f.odds) && Number(f.stake) > 0;

// ── THEME ─────────────────────────────────────────────────────────────────────
const C = {
  bg: "#0F1923",
  surface: "#1A2535",
  border: "#243044",
  green: "#00FF87",
  red: "#FF4D4D",
  amber: "#FFB547",
  blue: "#4A9EFF",
  textPrimary: "#F0F4F8",
  textSecondary: "#8A9BB0",
  tabActive: "#1A2535",
};

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;700&family=Inter:wght@400;500;600&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: ${C.bg}; color: ${C.textPrimary}; font-family: 'Inter', sans-serif; min-height: 100vh; }
  ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: ${C.bg}; } ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 2px; }
  input, select, textarea { background: ${C.bg}; color: ${C.textPrimary}; border: 1px solid ${C.border}; border-radius: 8px; padding: 10px 12px; font-family: inherit; font-size: 14px; width: 100%; outline: none; transition: border-color .15s; }
  input:focus, select:focus, textarea:focus { border-color: ${C.blue}; }
  input::placeholder { color: ${C.textSecondary}; }
  select option { background: ${C.surface}; }
  button { cursor: pointer; font-family: inherit; border: none; border-radius: 8px; font-weight: 600; transition: opacity .15s, transform .1s; }
  button:active { transform: scale(0.97); }
  button:disabled { opacity: 0.4; cursor: not-allowed; }
  label { font-size: 12px; color: ${C.textSecondary}; font-weight: 500; letter-spacing: .03em; text-transform: uppercase; display: block; margin-bottom: 5px; }
`;

// ── sub-components ────────────────────────────────────────────────────────────

function Ticker({ netPL, totalBets }) {
  const color = netPL > 0 ? C.green : netPL < 0 ? C.red : C.textSecondary;
  return (
    <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 13, color: C.textSecondary, letterSpacing: ".08em", textTransform: "uppercase" }}>
        SharpTrack
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 12, color: C.textSecondary }}>{totalBets} bet{totalBets !== 1 ? "s" : ""}</span>
        <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 20, fontWeight: 700, color, letterSpacing: ".02em" }}>
          {totalBets === 0 ? "—" : fmtMoney(netPL)}
        </span>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, color }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ fontSize: 11, color: C.textSecondary, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 26, fontWeight: 700, color: color || C.textPrimary, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.textSecondary, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function BetRow({ bet, onEdit }) {
  const profit = bet.result === "win" ? americanToProfit(bet.odds, bet.stake)
    : bet.result === "loss" ? -Number(bet.stake) : null;
  const resultColor = bet.result === "win" ? C.green : bet.result === "loss" ? C.red : bet.result === "push" ? C.textSecondary : C.amber;
  const resultLabel = bet.result.charAt(0).toUpperCase() + bet.result.slice(1);

  return (
    <div onClick={() => onEdit(bet)} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px", cursor: "pointer", transition: "border-color .15s" }}
      onMouseEnter={e => e.currentTarget.style.borderColor = C.blue}
      onMouseLeave={e => e.currentTarget.style.borderColor = C.border}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
        <div style={{ flex: 1, marginRight: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.textPrimary, lineHeight: 1.3 }}>{bet.description}</div>
          <div style={{ fontSize: 12, color: C.textSecondary, marginTop: 3 }}>{bet.sport} · {bet.betType} · {bet.book}</div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 18, fontWeight: 700, color: resultColor }}>{resultLabel}</div>
          {profit !== null && <div style={{ fontSize: 13, color: profit >= 0 ? C.green : C.red, fontWeight: 600 }}>{fmtMoney(profit)}</div>}
        </div>
      </div>
      <div style={{ display: "flex", gap: 12, fontSize: 12, color: C.textSecondary }}>
        <span>Odds: <span style={{ color: C.textPrimary, fontWeight: 500 }}>{fmtOdds(bet.odds)}</span></span>
        <span>Stake: <span style={{ color: C.textPrimary, fontWeight: 500 }}>${Number(bet.stake).toFixed(2)}</span></span>
        {bet.date && <span>{new Date(bet.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>}
      </div>
    </div>
  );
}

// ── TABS ──────────────────────────────────────────────────────────────────────

function Dashboard({ bets }) {
  const netPL = calcNetPL(bets);
  const settled = bets.filter(b => b.result === "win" || b.result === "loss");
  const totalWagered = settled.reduce((a, b) => a + Number(b.stake), 0);
  const roi = totalWagered > 0 ? (netPL / totalWagered) * 100 : null;
  const winRate = calcWinRate(bets);
  const wins = bets.filter(b => b.result === "win").length;
  const losses = bets.filter(b => b.result === "loss").length;
  const pushes = bets.filter(b => b.result === "push").length;
  const pending = bets.filter(b => b.result === "pending").length;

  // By sport breakdown
  const bySport = SPORTS.map(sport => {
    const sportBets = bets.filter(b => b.sport === sport);
    const sportSettled = sportBets.filter(b => b.result === "win" || b.result === "loss");
    return { sport, count: sportBets.length, pl: calcNetPL(sportBets), wins: sportBets.filter(b => b.result === "win").length, settled: sportSettled.length };
  }).filter(s => s.count > 0);

  // Running P&L for chart
  const runningPL = useMemo(() => {
    const chronological = [...bets].sort((a, b) => new Date(a.date) - new Date(b.date));
    let running = 0;
    return chronological.filter(b => b.result !== "pending").map(b => {
      if (b.result === "win") running += americanToProfit(b.odds, b.stake);
      else if (b.result === "loss") running -= Number(b.stake);
      return running;
    });
  }, [bets]);

  if (!bets.length) return (
    <div style={{ padding: 24, textAlign: "center" }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>📊</div>
      <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 22, color: C.textSecondary }}>No bets logged yet</div>
      <div style={{ fontSize: 14, color: C.textSecondary, marginTop: 8 }}>Head to Log Bet to record your first wager</div>
    </div>
  );

  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Main P&L */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "20px 18px", textAlign: "center" }}>
        <div style={{ fontSize: 12, color: C.textSecondary, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 8 }}>Net Profit / Loss</div>
        <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 52, fontWeight: 700, color: netPL >= 0 ? C.green : C.red, lineHeight: 1 }}>
          {fmtMoney(netPL)}
        </div>
        <div style={{ fontSize: 13, color: C.textSecondary, marginTop: 8 }}>
          {wins}W – {losses}L{pushes > 0 ? ` – ${pushes}P` : ""}{pending > 0 ? ` · ${pending} pending` : ""}
        </div>
      </div>

      {/* Stat grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <StatCard label="Win Rate" value={winRate !== null ? winRate.toFixed(1) + "%" : "—"} sub={`${wins}W of ${wins + losses} settled`} color={winRate !== null ? (winRate >= 52.4 ? C.green : winRate >= 45 ? C.amber : C.red) : undefined} />
        <StatCard label="ROI" value={roi !== null ? (roi >= 0 ? "+" : "") + roi.toFixed(1) + "%" : "—"} sub={`$${totalWagered.toFixed(0)} wagered`} color={roi !== null ? (roi > 0 ? C.green : roi === 0 ? C.textPrimary : C.red) : undefined} />
        <StatCard label="Total Bets" value={bets.length} sub={pending > 0 ? `${pending} pending` : "all settled"} />
        <StatCard label="Avg Stake" value={settled.length ? "$" + (totalWagered / settled.length).toFixed(0) : "—"} sub="per settled bet" />
      </div>

      {/* Mini chart */}
      {runningPL.length > 1 && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px" }}>
          <div style={{ fontSize: 12, color: C.textSecondary, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 10 }}>Running P&L</div>
          <MiniChart data={runningPL} />
        </div>
      )}

      {/* By sport */}
      {bySport.length > 0 && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px" }}>
          <div style={{ fontSize: 12, color: C.textSecondary, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 10 }}>By Sport</div>
          {bySport.map(s => (
            <div key={s.sport} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
              <div>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{s.sport}</span>
                <span style={{ fontSize: 12, color: C.textSecondary, marginLeft: 8 }}>{s.wins}W – {s.settled - s.wins}L</span>
              </div>
              <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 18, fontWeight: 700, color: s.pl >= 0 ? C.green : C.red }}>{fmtMoney(s.pl)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MiniChart({ data }) {
  const min = Math.min(0, ...data);
  const max = Math.max(0, ...data);
  const range = max - min || 1;
  const h = 60, w = 100;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  }).join(" ");
  const zeroY = h - ((0 - min) / range) * h;
  const lastVal = data[data.length - 1];
  const color = lastVal >= 0 ? C.green : C.red;

  return (
    <svg viewBox={`0 0 100 ${h}`} style={{ width: "100%", height: 60 }} preserveAspectRatio="none">
      <line x1="0" y1={zeroY} x2={w} y2={zeroY} stroke={C.border} strokeWidth="0.5" strokeDasharray="2,2" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function LogBet({ bets, setBets, editBet, setEditBet, setActiveTab }) {
  const blank = { sport: "", betType: "", book: "", description: "", odds: "", stake: "", result: "pending", notes: "", date: new Date().toISOString().split("T")[0] };
  const [form, setForm] = useState(editBet || blank);
  const [errors, setErrors] = useState({});
  const [saved, setSaved] = useState(false);

  useEffect(() => { if (editBet) setForm(editBet); }, [editBet]);

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setErrors(e => ({ ...e, [k]: false })); };

  const validate = () => {
    const e = {};
    if (!form.sport) e.sport = true;
    if (!form.betType) e.betType = true;
    if (!form.book) e.book = true;
    if (!form.description.trim()) e.description = true;
    if (!validateOdds(form.odds)) e.odds = true;
    if (!form.stake || Number(form.stake) <= 0) e.stake = true;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;
    const bet = { ...form, id: form.id || uid(), odds: Number(form.odds), stake: Number(form.stake) };
    setBets(prev => {
      const updated = form.id ? prev.map(b => b.id === bet.id ? bet : b) : [bet, ...prev];
      saveBets(updated);
      return updated;
    });
    setSaved(true);
    setEditBet(null);
    setForm(blank);
    setTimeout(() => { setSaved(false); setActiveTab("history"); }, 800);
  };

  const handleDelete = () => {
    if (!form.id) return;
    setBets(prev => { const updated = prev.filter(b => b.id !== form.id); saveBets(updated); return updated; });
    setEditBet(null);
    setForm(blank);
    setActiveTab("history");
  };

  const inputStyle = (k) => ({ ...(errors[k] ? { borderColor: C.red } : {}) });
  const isEdit = !!form.id;

  return (
    <div style={{ padding: 16 }}>
      <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 22, fontWeight: 700, marginBottom: 16, letterSpacing: ".02em" }}>
        {isEdit ? "Edit Bet" : "Log a Bet"}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Sport + Bet Type */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label>Sport *</label>
            <select value={form.sport} onChange={e => set("sport", e.target.value)} style={inputStyle("sport")}>
              <option value="">Select</option>
              {SPORTS.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label>Bet Type *</label>
            <select value={form.betType} onChange={e => set("betType", e.target.value)} style={inputStyle("betType")}>
              <option value="">Select</option>
              {BET_TYPES.map(b => <option key={b}>{b}</option>)}
            </select>
          </div>
        </div>

        {/* Book */}
        <div>
          <label>Sportsbook *</label>
          <select value={form.book} onChange={e => set("book", e.target.value)} style={inputStyle("book")}>
            <option value="">Select</option>
            {BOOKS.map(b => <option key={b}>{b}</option>)}
          </select>
        </div>

        {/* Description */}
        <div>
          <label>Description *</label>
          <input value={form.description} onChange={e => set("description", e.target.value)} placeholder="e.g. Chiefs -3.5 vs Ravens" style={inputStyle("description")} />
        </div>

        {/* Odds + Stake */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label>Odds (American) *</label>
            <input value={form.odds} onChange={e => set("odds", e.target.value)} placeholder="-110 or +150" style={inputStyle("odds")} />
            {errors.odds && <div style={{ fontSize: 11, color: C.red, marginTop: 3 }}>Enter valid American odds (e.g. -110, +150)</div>}
          </div>
          <div>
            <label>Stake ($) *</label>
            <input type="number" min="0.01" step="0.01" value={form.stake} onChange={e => set("stake", e.target.value)} placeholder="100" style={inputStyle("stake")} />
          </div>
        </div>

        {/* Implied prob helper */}
        {validateOdds(form.odds) && (
          <div style={{ fontSize: 12, color: C.textSecondary, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px" }}>
            Implied probability: <span style={{ color: C.textPrimary, fontWeight: 600 }}>{(americanToImplied(form.odds) * 100).toFixed(1)}%</span>
            {form.stake && Number(form.stake) > 0 && validateOdds(form.odds) && (
              <> · To win: <span style={{ color: C.green, fontWeight: 600 }}>${americanToProfit(form.odds, form.stake).toFixed(2)}</span></>
            )}
          </div>
        )}

        {/* Result */}
        <div>
          <label>Result</label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
            {RESULTS.map(r => {
              const rColor = r === "win" ? C.green : r === "loss" ? C.red : r === "push" ? C.textSecondary : C.amber;
              const active = form.result === r;
              return (
                <button key={r} onClick={() => set("result", r)} style={{ padding: "9px 4px", fontSize: 13, background: active ? rColor : C.bg, color: active ? C.bg : rColor, border: `1.5px solid ${rColor}`, borderRadius: 8, textTransform: "capitalize", fontWeight: 700 }}>
                  {r}
                </button>
              );
            })}
          </div>
        </div>

        {/* Date */}
        <div>
          <label>Date</label>
          <input type="date" value={form.date} onChange={e => set("date", e.target.value)} />
        </div>

        {/* Notes */}
        <div>
          <label>Notes (optional)</label>
          <input value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Why you made this bet..." />
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <button onClick={handleSave} disabled={saved} style={{ flex: 1, padding: "13px", fontSize: 15, background: saved ? C.green : C.blue, color: "#fff" }}>
            {saved ? "✓ Saved!" : isEdit ? "Update Bet" : "Save Bet"}
          </button>
          {isEdit && (
            <button onClick={handleDelete} style={{ padding: "13px 16px", background: "transparent", color: C.red, border: `1.5px solid ${C.red}`, fontSize: 13 }}>
              Delete
            </button>
          )}
        </div>
        {isEdit && (
          <button onClick={() => { setEditBet(null); setForm(blank); }} style={{ width: "100%", padding: "10px", background: "transparent", color: C.textSecondary, fontSize: 13, border: `1px solid ${C.border}` }}>
            Cancel — log new bet instead
          </button>
        )}
      </div>
    </div>
  );
}

function History({ bets, onEdit }) {
  const [filter, setFilter] = useState({ sport: "", result: "", book: "" });
  const filtered = bets.filter(b =>
    (!filter.sport || b.sport === filter.sport) &&
    (!filter.result || b.result === filter.result) &&
    (!filter.book || b.book === filter.book)
  );

  if (!bets.length) return (
    <div style={{ padding: 24, textAlign: "center" }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
      <div style={{ fontSize: 16, color: C.textSecondary }}>No bets yet — log your first one</div>
    </div>
  );

  return (
    <div style={{ padding: 16 }}>
      <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 22, fontWeight: 700, marginBottom: 12 }}>Bet History</div>

      {/* Filters */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 14 }}>
        {[
          { key: "sport", opts: SPORTS },
          { key: "result", opts: RESULTS },
          { key: "book", opts: BOOKS },
        ].map(({ key, opts }) => (
          <select key={key} value={filter[key]} onChange={e => setFilter(f => ({ ...f, [key]: e.target.value }))}
            style={{ fontSize: 12, padding: "7px 8px" }}>
            <option value="">All {key}s</option>
            {opts.map(o => <option key={o}>{o}</option>)}
          </select>
        ))}
      </div>

      <div style={{ fontSize: 12, color: C.textSecondary, marginBottom: 10 }}>{filtered.length} bet{filtered.length !== 1 ? "s" : ""}</div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {filtered.map(bet => <BetRow key={bet.id} bet={bet} onEdit={onEdit} />)}
      </div>
    </div>
  );
}

function EVCalc() {
  const [form, setForm] = useState({ yourOdds: "", fairOdds: "", stake: "100" });
  const [result, setResult] = useState(null);

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setResult(null); };

  const calc = () => {
    if (!validateOdds(form.yourOdds) || !validateOdds(form.fairOdds) || !Number(form.stake)) return;
    const ev = calcEV(form.yourOdds, form.fairOdds, form.stake);
    const winProb = americanToImplied(form.fairOdds);
    const yourImplied = americanToImplied(form.yourOdds);
    const edge = winProb - yourImplied;
    const profit = americanToProfit(form.yourOdds, form.stake);
    setResult({ ev, winProb, yourImplied, edge, profit });
  };

  const canCalc = validateOdds(form.yourOdds) && validateOdds(form.fairOdds) && Number(form.stake) > 0;

  return (
    <div style={{ padding: 16 }}>
      <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 22, fontWeight: 700, marginBottom: 4 }}>EV Calculator</div>
      <div style={{ fontSize: 13, color: C.textSecondary, marginBottom: 16, lineHeight: 1.5 }}>
        Expected Value tells you if a bet is profitable long-term. A +EV bet means you have an edge over the book.
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <label>Your Odds (from your sportsbook)</label>
          <input value={form.yourOdds} onChange={e => set("yourOdds", e.target.value)} placeholder="+110" />
          {validateOdds(form.yourOdds) && <div style={{ fontSize: 12, color: C.textSecondary, marginTop: 4 }}>Implied: {(americanToImplied(form.yourOdds) * 100).toFixed(1)}%</div>}
        </div>

        <div>
          <label>Fair Odds (from a sharp book like Pinnacle, or no-vig calc)</label>
          <input value={form.fairOdds} onChange={e => set("fairOdds", e.target.value)} placeholder="-105" />
          {validateOdds(form.fairOdds) && <div style={{ fontSize: 12, color: C.textSecondary, marginTop: 4 }}>True win probability: {(americanToImplied(form.fairOdds) * 100).toFixed(1)}%</div>}
        </div>

        <div>
          <label>Stake ($)</label>
          <input type="number" value={form.stake} onChange={e => set("stake", e.target.value)} placeholder="100" />
        </div>

        <button onClick={calc} disabled={!canCalc} style={{ padding: "13px", fontSize: 15, background: C.blue, color: "#fff" }}>
          Calculate EV
        </button>

        {result && (
          <div style={{ background: C.surface, border: `1.5px solid ${result.ev >= 0 ? C.green : C.red}`, borderRadius: 12, padding: 16 }}>
            {/* Main result */}
            <div style={{ textAlign: "center", marginBottom: 16, paddingBottom: 14, borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 12, color: C.textSecondary, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>Expected Value</div>
              <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 44, fontWeight: 700, color: result.ev >= 0 ? C.green : C.red }}>
                {result.ev >= 0 ? "+" : ""}${Math.abs(result.ev).toFixed(2)}
              </div>
              <div style={{ fontSize: 14, color: result.ev >= 0 ? C.green : C.red, fontWeight: 600, marginTop: 4 }}>
                {result.ev >= 0 ? "✓ Positive EV — you have an edge" : "✗ Negative EV — book has the edge"}
              </div>
            </div>

            {/* Breakdown */}
            <div style={{ fontSize: 13, color: C.textSecondary, marginBottom: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em" }}>How it's calculated</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
              {[
                ["True win probability", `${(result.winProb * 100).toFixed(1)}%`, "From fair odds"],
                ["If you win", `+$${result.profit.toFixed(2)}`, `${(result.winProb * 100).toFixed(1)}% chance`],
                ["If you lose", `-$${Number(form.stake).toFixed(2)}`, `${((1 - result.winProb) * 100).toFixed(1)}% chance`],
                ["Your edge vs book", `${result.edge >= 0 ? "+" : ""}${(result.edge * 100).toFixed(2)}%`, result.edge >= 0 ? "You're getting a good number" : "Book has an edge on this line"],
              ].map(([label, val, sub]) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
                  <div>
                    <div style={{ color: C.textPrimary }}>{label}</div>
                    <div style={{ fontSize: 11, color: C.textSecondary, marginTop: 1 }}>{sub}</div>
                  </div>
                  <div style={{ fontWeight: 600, color: C.textPrimary }}>{val}</div>
                </div>
              ))}
              <div style={{ background: C.bg, borderRadius: 8, padding: "10px 12px", fontSize: 12, color: C.textSecondary, lineHeight: 1.5, marginTop: 4 }}>
                <strong style={{ color: C.textPrimary }}>Formula:</strong> EV = (Win% × Profit) − (Loss% × Stake)<br />
                = ({(result.winProb * 100).toFixed(1)}% × ${result.profit.toFixed(2)}) − ({((1 - result.winProb) * 100).toFixed(1)}% × ${Number(form.stake).toFixed(2)})<br />
                = <strong style={{ color: result.ev >= 0 ? C.green : C.red }}>{result.ev >= 0 ? "+" : ""}${result.ev.toFixed(2)}</strong>
              </div>
            </div>
          </div>
        )}

        {/* Education */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>What is "fair odds"?</div>
          <div style={{ fontSize: 13, color: C.textSecondary, lineHeight: 1.6 }}>
            Fair odds strip out the sportsbook's vig (their cut). You can find them by checking a sharp book like <strong style={{ color: C.textPrimary }}>Pinnacle</strong>, or using a no-vig calculator to remove the juice from two-sided markets. If Pinnacle has Chiefs -107 / Ravens -107, the fair line on Chiefs is -107.
          </div>
        </div>
      </div>
    </div>
  );
}

// ── ROOT ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [bets, setBets] = useState(loadBets);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [editBet, setEditBet] = useState(null);

  const netPL = calcNetPL(bets);

  const handleEdit = (bet) => {
    setEditBet(bet);
    setActiveTab("log");
  };

  const tabs = [
    { id: "dashboard", label: "Dashboard", icon: "📊" },
    { id: "log", label: "Log Bet", icon: "➕" },
    { id: "history", label: "History", icon: "📋" },
    { id: "ev", label: "EV Calc", icon: "🎯" },
  ];

  return (
    <>
      <style>{css}</style>
      <div style={{ maxWidth: 480, margin: "0 auto", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
        <Ticker netPL={netPL} totalBets={bets.length} />

        <div style={{ flex: 1, overflowY: "auto", paddingBottom: 70 }}>
          {activeTab === "dashboard" && <Dashboard bets={bets} />}
          {activeTab === "log" && <LogBet bets={bets} setBets={setBets} editBet={editBet} setEditBet={setEditBet} setActiveTab={setActiveTab} />}
          {activeTab === "history" && <History bets={bets} onEdit={handleEdit} />}
          {activeTab === "ev" && <EVCalc />}
        </div>

        {/* Bottom nav */}
        <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, background: C.surface, borderTop: `1px solid ${C.border}`, display: "flex", zIndex: 100 }}>
          {tabs.map(t => {
            const active = activeTab === t.id;
            return (
              <button key={t.id} onClick={() => { setActiveTab(t.id); if (t.id !== "log") setEditBet(null); }}
                style={{ flex: 1, padding: "10px 4px 12px", background: "transparent", color: active ? C.green : C.textSecondary, fontSize: 10, fontWeight: active ? 600 : 400, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, borderRadius: 0, letterSpacing: ".03em", textTransform: "uppercase" }}>
                <span style={{ fontSize: 20 }}>{t.icon}</span>
                {t.label}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

