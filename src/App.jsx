import React from "react";
import { useState, useEffect, useMemo, useRef } from "react";

// ── MATH HELPERS ─────────────────────────────────────────────────────────────
const americanToImplied = (odds) => {
  const o = Number(odds);
  if (o > 0) return 100 / (o + 100);
  return Math.abs(o) / (Math.abs(o) + 100);
};
const americanToProfit = (odds, stake) => {
  const o = Number(odds), s = Number(stake);
  if (o > 0) return (o / 100) * s;
  return (100 / Math.abs(o)) * s;
};
const impliedToAmerican = (prob) => {
  if (prob <= 0 || prob >= 1) return null;
  if (prob >= 0.5) return Math.round(-(prob / (1 - prob)) * 100);
  return Math.round(((1 - prob) / prob) * 100);
};
const noVigFairOdds = (oddsA, oddsB) => {
  const implA = americanToImplied(oddsA), implB = americanToImplied(oddsB);
  const over = implA + implB;
  return { fairOddsA: impliedToAmerican(implA / over), fairOddsB: impliedToAmerican(implB / over), overround: ((over - 1) * 100).toFixed(2), fairProbA: ((implA / over) * 100).toFixed(1), fairProbB: ((implB / over) * 100).toFixed(1) };
};
const calcEV = (yourOdds, fairOdds, stake) => {
  const wp = americanToImplied(fairOdds), profit = americanToProfit(yourOdds, stake);
  return (wp * profit) - ((1 - wp) * Number(stake));
};
const calcNetPL = (bets) => bets.reduce((acc, b) => {
  if (b.result === "win") return acc + americanToProfit(b.odds, b.stake);
  if (b.result === "loss") return acc - Number(b.stake);
  return acc;
}, 0);
const calcWinRate = (bets) => {
  const s = bets.filter(b => b.result === "win" || b.result === "loss");
  if (!s.length) return null;
  return (bets.filter(b => b.result === "win").length / s.length) * 100;
};
const validateOdds = (val) => {
  const n = Number(val);
  if (isNaN(n) || val === "" || val === "-") return false;
  if (n === 0 || (n > -100 && n < 100)) return false;
  return true;
};
const fmtMoney = (n) => (n >= 0 ? "+" : "") + "$" + Math.abs(n).toFixed(2);
const fmtOdds = (o) => { const n = Number(o); return n > 0 ? `+${n}` : `${n}`; };
const uid = () => Math.random().toString(36).slice(2, 10);

// ── INSIGHT CALCULATIONS ──────────────────────────────────────────────────────
const roiByDimension = (bets, dim) => {
  const groups = {};
  bets.forEach(b => {
    const key = b[dim];
    if (!groups[key]) groups[key] = { wagered: 0, pl: 0, wins: 0, losses: 0 };
    const g = groups[key];
    if (b.result === "win") { g.pl += americanToProfit(b.odds, b.stake); g.wagered += Number(b.stake); g.wins++; }
    else if (b.result === "loss") { g.pl -= Number(b.stake); g.wagered += Number(b.stake); g.losses++; }
  });
  return Object.entries(groups)
    .filter(([, g]) => g.wins + g.losses >= 2)
    .map(([key, g]) => ({ key, roi: g.wagered > 0 ? (g.pl / g.wagered) * 100 : 0, winRate: (g.wins + g.losses) > 0 ? (g.wins / (g.wins + g.losses)) * 100 : 0, pl: g.pl, wagered: g.wagered, wins: g.wins, losses: g.losses }))
    .sort((a, b) => b.roi - a.roi);
};

const calcStreak = (bets) => {
  const settled = [...bets].filter(b => b.result === "win" || b.result === "loss").sort((a, b) => new Date(a.date) - new Date(b.date));
  if (!settled.length) return { current: 0, currentType: null, longest: 0, longestType: null };
  let cur = 1, curType = settled[settled.length - 1].result, longest = 1, longestType = settled[0].result, run = 1;
  for (let i = 1; i < settled.length; i++) {
    if (settled[i].result === settled[i - 1].result) { run++; if (run > longest) { longest = run; longestType = settled[i].result; } } else run = 1;
  }
  // current streak from end
  cur = 1; curType = settled[settled.length - 1].result;
  for (let i = settled.length - 2; i >= 0; i--) { if (settled[i].result === curType) cur++; else break; }
  return { current: cur, currentType: curType, longest, longestType };
};

const chasingSignal = (bets) => {
  const settled = [...bets].filter(b => b.result === "win" || b.result === "loss").sort((a, b) => new Date(a.date) - new Date(b.date));
  if (settled.length < 3) return null;
  let afterWin = [], afterLoss = [];
  for (let i = 1; i < settled.length; i++) {
    if (settled[i - 1].result === "win") afterWin.push(Number(settled[i].stake));
    else afterLoss.push(Number(settled[i].stake));
  }
  const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  const aw = avg(afterWin), al = avg(afterLoss);
  return { avgAfterWin: aw, avgAfterLoss: al, chasing: al > aw * 1.2, afterWinCount: afterWin.length, afterLossCount: afterLoss.length };
};

const buildInsightSummary = (bets) => {
  const settled = bets.filter(b => b.result === "win" || b.result === "loss");
  if (settled.length < 3) return null;
  const netPL = calcNetPL(bets);
  const wagered = settled.reduce((a, b) => a + Number(b.stake), 0);
  const roi = wagered > 0 ? (netPL / wagered) * 100 : 0;
  const winRate = calcWinRate(bets);
  const bySport = roiByDimension(bets, "sport");
  const byType = roiByDimension(bets, "betType");
  const byBook = roiByDimension(bets, "book");
  const streak = calcStreak(bets);
  const chasing = chasingSignal(bets);
  const withPL = settled.map(b => ({ ...b, pl: b.result === "win" ? americanToProfit(b.odds, b.stake) : -Number(b.stake) }));
  const best = [...withPL].sort((a, b) => b.pl - a.pl)[0];
  const worst = [...withPL].sort((a, b) => a.pl - b.pl)[0];
  return { netPL, roi, winRate, wagered, bySport, byType, byBook, streak, chasing, best, worst, totalBets: bets.length, settledCount: settled.length };
};

// ── CONSTANTS ─────────────────────────────────────────────────────────────────
const SPORTS = ["NFL", "NBA", "MLB"];
const SPORT_KEYS = { NFL: "americanfootball_nfl", NBA: "basketball_nba", MLB: "baseball_mlb" };
const BET_TYPES = ["Moneyline", "Spread", "Over/Under", "Prop", "Parlay", "Futures"];
const BOOKS = ["DraftKings", "FanDuel", "BetMGM", "Caesars", "ESPN Bet", "PointsBet", "Other"];
const RESULTS = ["pending", "win", "loss", "push"];
const MARKET_LABELS = { h2h: "Moneyline", spreads: "Spread", totals: "Over/Under" };

// ── STORAGE ───────────────────────────────────────────────────────────────────
const BETS_KEY = "sharptrack_bets_v1";
const KEY_KEY = "sharptrack_apikey_v1";
const loadBets = () => { try { return JSON.parse(localStorage.getItem(BETS_KEY) || "[]"); } catch { return []; } };
const saveBets = (b) => { try { localStorage.setItem(BETS_KEY, JSON.stringify(b)); } catch {} };
const loadApiKey = () => { try { return localStorage.getItem(KEY_KEY) || ""; } catch { return ""; } };
const saveApiKey = (k) => { try { localStorage.setItem(KEY_KEY, k); } catch {} };

// ── THEME ─────────────────────────────────────────────────────────────────────
const C = {
  bg: "#0F1923", surface: "#1A2535", border: "#243044",
  green: "#00FF87", red: "#FF4D4D", amber: "#FFB547", blue: "#4A9EFF",
  textPrimary: "#F0F4F8", textSecondary: "#8A9BB0",
};

const css = 
`
  @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;700&family=Inter:wght@400;500;600&display=swap');
[data-netlify-deploy-id] { display: none !important; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: ${C.bg}; color: ${C.textPrimary}; font-family: 'Inter', sans-serif; min-height: 100vh; }
  ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 2px; }
  input, select { background: ${C.bg}; color: ${C.textPrimary}; border: 1px solid ${C.border}; border-radius: 8px; padding: 10px 12px; font-family: inherit; font-size: 14px; width: 100%; outline: none; transition: border-color .15s; }
  input:focus, select:focus { border-color: ${C.blue}; }
  input::placeholder { color: ${C.textSecondary}; }
  select option { background: ${C.surface}; }
  button { cursor: pointer; font-family: inherit; border: none; border-radius: 8px; font-weight: 600; transition: opacity .15s, transform .1s; }
  button:active { transform: scale(0.97); }
  button:disabled { opacity: 0.4; cursor: not-allowed; }
  label { font-size: 12px; color: ${C.textSecondary}; font-weight: 500; letter-spacing: .03em; display: block; margin-bottom: 5px; }
  @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:.4 } }
  @keyframes fadeIn { from { opacity:0; transform: translateY(6px) } to { opacity:1; transform: translateY(0) } }
  .msg-appear { animation: fadeIn .25s ease forwards; }
`;

// ── ODDS API ──────────────────────────────────────────────────────────────────
const fetchOdds = async (sportKey, apiKey) => {
  const url = `https://api.the-odds-api.com/v4/sports/${sportKey}/odds?apiKey=${apiKey}&regions=us&markets=h2h,spreads,totals&oddsFormat=american`;
  const res = await fetch(url);
  if (!res.ok) { const txt = await res.text(); throw new Error(res.status === 401 ? "Invalid API key" : res.status === 429 ? "Rate limit — try again shortly" : `API error ${res.status}: ${txt}`); }
  return { data: await res.json(), remaining: res.headers.get("x-requests-remaining") };
};

// ── SHARED COMPONENTS ─────────────────────────────────────────────────────────
function Ticker({ netPL, totalBets }) {
  const color = netPL > 0 ? C.green : netPL < 0 ? C.red : C.textSecondary;
  return (
    <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <span style={{ fontFamily: "'Barlow Condensed'", fontSize: 13, color: C.textSecondary, letterSpacing: ".08em", textTransform: "uppercase" }}>SharpTrack</span>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 12, color: C.textSecondary }}>{totalBets} bet{totalBets !== 1 ? "s" : ""}</span>
        <span style={{ fontFamily: "'Barlow Condensed'", fontSize: 20, fontWeight: 700, color }}>{totalBets === 0 ? "—" : fmtMoney(netPL)}</span>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, color, small }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ fontSize: 11, color: C.textSecondary, marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: "'Barlow Condensed'", fontSize: small ? 20 : 26, fontWeight: 700, color: color || C.textPrimary, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.textSecondary, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function MiniChart({ data }) {
  const min = Math.min(0, ...data), max = Math.max(0, ...data), range = max - min || 1, h = 60;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * 100},${h - ((v - min) / range) * h}`).join(" ");
  const zeroY = h - ((0 - min) / range) * h;
  const color = data[data.length - 1] >= 0 ? C.green : C.red;
  return (
    <svg viewBox={`0 0 100 ${h}`} style={{ width: "100%", height: 60 }} preserveAspectRatio="none">
      <line x1="0" y1={zeroY} x2="100" y2={zeroY} stroke={C.border} strokeWidth="0.5" strokeDasharray="2,2" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function BetRow({ bet, onEdit }) {
  const profit = bet.result === "win" ? americanToProfit(bet.odds, bet.stake) : bet.result === "loss" ? -Number(bet.stake) : null;
  const rc = { win: C.green, loss: C.red, push: C.textSecondary, pending: C.amber }[bet.result];
  return (
    <div onClick={() => onEdit(bet)} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px", cursor: "pointer", transition: "border-color .15s" }}
      onMouseEnter={e => e.currentTarget.style.borderColor = C.blue} onMouseLeave={e => e.currentTarget.style.borderColor = C.border}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
        <div style={{ flex: 1, marginRight: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{bet.description}</div>
          <div style={{ fontSize: 12, color: C.textSecondary, marginTop: 3 }}>{bet.sport} · {bet.betType} · {bet.book}</div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontFamily: "'Barlow Condensed'", fontSize: 18, fontWeight: 700, color: rc }}>{bet.result.charAt(0).toUpperCase() + bet.result.slice(1)}</div>
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

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
function Dashboard({ bets }) {
  const netPL = calcNetPL(bets);
  const settled = bets.filter(b => b.result === "win" || b.result === "loss");
  const wagered = settled.reduce((a, b) => a + Number(b.stake), 0);
  const roi = wagered > 0 ? (netPL / wagered) * 100 : null;
  const winRate = calcWinRate(bets);
  const wins = bets.filter(b => b.result === "win").length;
  const losses = bets.filter(b => b.result === "loss").length;
  const pushes = bets.filter(b => b.result === "push").length;
  const pending = bets.filter(b => b.result === "pending").length;
  const bySport = SPORTS.map(sport => { const sb = bets.filter(b => b.sport === sport); return { sport, count: sb.length, pl: calcNetPL(sb), wins: sb.filter(b => b.result === "win").length, losses: sb.filter(b => b.result === "loss").length }; }).filter(s => s.count > 0);
  const runningPL = useMemo(() => { let r = 0; return [...bets].sort((a, b) => new Date(a.date) - new Date(b.date)).filter(b => b.result !== "pending").map(b => { if (b.result === "win") r += americanToProfit(b.odds, b.stake); else if (b.result === "loss") r -= Number(b.stake); return r; }); }, [bets]);

  if (!bets.length) return (
    <div style={{ padding: 24, textAlign: "center" }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>📊</div>
      <div style={{ fontFamily: "'Barlow Condensed'", fontSize: 22, color: C.textSecondary }}>No bets logged yet</div>
      <div style={{ fontSize: 14, color: C.textSecondary, marginTop: 8 }}>Head to Log Bet to record your first wager</div>
    </div>
  );

  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "20px 18px", textAlign: "center" }}>
        <div style={{ fontSize: 12, color: C.textSecondary, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 8 }}>Net Profit / Loss</div>
        <div style={{ fontFamily: "'Barlow Condensed'", fontSize: 52, fontWeight: 700, color: netPL >= 0 ? C.green : C.red, lineHeight: 1 }}>{fmtMoney(netPL)}</div>
        <div style={{ fontSize: 13, color: C.textSecondary, marginTop: 8 }}>{wins}W – {losses}L{pushes > 0 ? ` – ${pushes}P` : ""}{pending > 0 ? ` · ${pending} pending` : ""}</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <StatCard label="Win Rate" value={winRate !== null ? winRate.toFixed(1) + "%" : "—"} sub={`${wins}W of ${wins + losses} settled`} color={winRate !== null ? (winRate >= 52.4 ? C.green : winRate >= 45 ? C.amber : C.red) : undefined} />
        <StatCard label="ROI" value={roi !== null ? (roi >= 0 ? "+" : "") + roi.toFixed(1) + "%" : "—"} sub={`$${wagered.toFixed(0)} wagered`} color={roi !== null ? (roi > 0 ? C.green : roi === 0 ? C.textPrimary : C.red) : undefined} />
        <StatCard label="Total Bets" value={bets.length} sub={pending > 0 ? `${pending} pending` : "all settled"} />
        <StatCard label="Avg Stake" value={settled.length ? "$" + (wagered / settled.length).toFixed(0) : "—"} sub="per settled bet" />
      </div>
      {runningPL.length > 1 && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px" }}>
          <div style={{ fontSize: 12, color: C.textSecondary, marginBottom: 10 }}>Running P&L</div>
          <MiniChart data={runningPL} />
        </div>
      )}
      {bySport.length > 0 && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px" }}>
          <div style={{ fontSize: 12, color: C.textSecondary, marginBottom: 10 }}>By Sport</div>
          {bySport.map(s => (
            <div key={s.sport} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
              <div><span style={{ fontSize: 14, fontWeight: 600 }}>{s.sport}</span><span style={{ fontSize: 12, color: C.textSecondary, marginLeft: 8 }}>{s.wins}W – {s.losses}L</span></div>
              <span style={{ fontFamily: "'Barlow Condensed'", fontSize: 18, fontWeight: 700, color: s.pl >= 0 ? C.green : C.red }}>{fmtMoney(s.pl)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── LOG BET ───────────────────────────────────────────────────────────────────
function LogBet({ bets, setBets, editBet, setEditBet, setActiveTab }) {
  const blank = { sport: "", betType: "", book: "", description: "", odds: "", stake: "", result: "pending", notes: "", date: new Date().toISOString().split("T")[0] };
  const [form, setFormState] = useState(editBet || blank);
  const [errors, setErrors] = useState({});
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (editBet) setFormState(editBet); }, [editBet]);
  const set = (k, v) => { setFormState(f => ({ ...f, [k]: v })); setErrors(e => ({ ...e, [k]: false })); };
  const validate = () => { const e = {}; if (!form.sport) e.sport = true; if (!form.betType) e.betType = true; if (!form.book) e.book = true; if (!form.description.trim()) e.description = true; if (!validateOdds(form.odds)) e.odds = true; if (!form.stake || Number(form.stake) <= 0) e.stake = true; setErrors(e); return !Object.keys(e).length; };
  const handleSave = () => { if (!validate()) return; const bet = { ...form, id: form.id || uid(), odds: Number(form.odds), stake: Number(form.stake) }; setBets(prev => { const u = form.id ? prev.map(b => b.id === bet.id ? bet : b) : [bet, ...prev]; saveBets(u); return u; }); setSaved(true); setEditBet(null); setFormState(blank); setTimeout(() => { setSaved(false); setActiveTab("history"); }, 800); };
  const handleDelete = () => { if (!form.id) return; setBets(prev => { const u = prev.filter(b => b.id !== form.id); saveBets(u); return u; }); setEditBet(null); setFormState(blank); setActiveTab("history"); };
  const err = (k) => errors[k] ? { borderColor: C.red } : {};
  const isEdit = !!form.id;
  return (
    <div style={{ padding: 16 }}>
      <div style={{ fontFamily: "'Barlow Condensed'", fontSize: 22, fontWeight: 700, marginBottom: 16 }}>{isEdit ? "Edit Bet" : "Log a Bet"}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div><label>Sport *</label><select value={form.sport} onChange={e => set("sport", e.target.value)} style={err("sport")}><option value="">Select</option>{SPORTS.map(s => <option key={s}>{s}</option>)}</select></div>
          <div><label>Bet Type *</label><select value={form.betType} onChange={e => set("betType", e.target.value)} style={err("betType")}><option value="">Select</option>{BET_TYPES.map(b => <option key={b}>{b}</option>)}</select></div>
        </div>
        <div><label>Sportsbook *</label><select value={form.book} onChange={e => set("book", e.target.value)} style={err("book")}><option value="">Select</option>{BOOKS.map(b => <option key={b}>{b}</option>)}</select></div>
        <div><label>Description *</label><input value={form.description} onChange={e => set("description", e.target.value)} placeholder="e.g. Chiefs -3.5 vs Ravens" style={err("description")} /></div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div><label>Odds (American) *</label><input value={form.odds} onChange={e => set("odds", e.target.value)} placeholder="-110 or +150" style={err("odds")} />{errors.odds && <div style={{ fontSize: 11, color: C.red, marginTop: 3 }}>Enter valid odds (e.g. -110, +150)</div>}</div>
          <div><label>Stake ($) *</label><input type="number" min="0.01" step="0.01" value={form.stake} onChange={e => set("stake", e.target.value)} placeholder="100" style={err("stake")} /></div>
        </div>
        {validateOdds(form.odds) && (<div style={{ fontSize: 12, color: C.textSecondary, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px" }}>Implied: <span style={{ color: C.textPrimary, fontWeight: 600 }}>{(americanToImplied(form.odds) * 100).toFixed(1)}%</span>{form.stake && Number(form.stake) > 0 && <> · To win: <span style={{ color: C.green, fontWeight: 600 }}>${americanToProfit(form.odds, form.stake).toFixed(2)}</span></>}</div>)}
        <div><label>Result</label><div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>{RESULTS.map(r => { const rc = { win: C.green, loss: C.red, push: C.textSecondary, pending: C.amber }[r]; const active = form.result === r; return <button key={r} onClick={() => set("result", r)} style={{ padding: "9px 4px", fontSize: 13, background: active ? rc : C.bg, color: active ? C.bg : rc, border: `1.5px solid ${rc}`, borderRadius: 8, textTransform: "capitalize", fontWeight: 700 }}>{r}</button>; })}</div></div>
        <div><label>Date</label><input type="date" value={form.date} onChange={e => set("date", e.target.value)} /></div>
        <div><label>Notes (optional)</label><input value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Why you made this bet..." /></div>
        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <button onClick={handleSave} disabled={saved} style={{ flex: 1, padding: "13px", fontSize: 15, background: saved ? C.green : C.blue, color: "#fff" }}>{saved ? "✓ Saved!" : isEdit ? "Update Bet" : "Save Bet"}</button>
          {isEdit && <button onClick={handleDelete} style={{ padding: "13px 16px", background: "transparent", color: C.red, border: `1.5px solid ${C.red}`, fontSize: 13 }}>Delete</button>}
        </div>
        {isEdit && <button onClick={() => { setEditBet(null); setFormState(blank); }} style={{ width: "100%", padding: "10px", background: "transparent", color: C.textSecondary, fontSize: 13, border: `1px solid ${C.border}` }}>Cancel — log new bet instead</button>}
      </div>
    </div>
  );
}

// ── HISTORY ───────────────────────────────────────────────────────────────────
function History({ bets, onEdit }) {
  const [filter, setFilter] = useState({ sport: "", result: "", book: "" });
  const filtered = bets.filter(b => (!filter.sport || b.sport === filter.sport) && (!filter.result || b.result === filter.result) && (!filter.book || b.book === filter.book));
  if (!bets.length) return (<div style={{ padding: 24, textAlign: "center" }}><div style={{ fontSize: 48, marginBottom: 12 }}>📋</div><div style={{ fontSize: 16, color: C.textSecondary }}>No bets yet — log your first one</div></div>);
  return (
    <div style={{ padding: 16 }}>
      <div style={{ fontFamily: "'Barlow Condensed'", fontSize: 22, fontWeight: 700, marginBottom: 12 }}>Bet History</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 14 }}>
        {[{ key: "sport", opts: SPORTS }, { key: "result", opts: RESULTS }, { key: "book", opts: BOOKS }].map(({ key, opts }) => (
          <select key={key} value={filter[key]} onChange={e => setFilter(f => ({ ...f, [key]: e.target.value }))} style={{ fontSize: 12, padding: "7px 8px" }}><option value="">All {key}s</option>{opts.map(o => <option key={o}>{o}</option>)}</select>
        ))}
      </div>
      <div style={{ fontSize: 12, color: C.textSecondary, marginBottom: 10 }}>{filtered.length} bet{filtered.length !== 1 ? "s" : ""}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{filtered.map(bet => <BetRow key={bet.id} bet={bet} onEdit={onEdit} />)}</div>
    </div>
  );
}

// ── ODDS SCREEN ───────────────────────────────────────────────────────────────
function OddsScreen({ apiKey, setApiKey, setActiveTab, setEditBet }) {
  const [keyInput, setKeyInput] = useState(apiKey);
  const [sport, setSport] = useState("NFL");
  const [market, setMarket] = useState("h2h");
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [remaining, setRemaining] = useState(null);
  const [selectedOutcome, setSelectedOutcome] = useState(null);
  const [stake, setStake] = useState("100");
  const handleSaveKey = () => { saveApiKey(keyInput.trim()); setApiKey(keyInput.trim()); };
  const handleFetch = async () => { if (!apiKey) return; setLoading(true); setError(""); setGames([]); setSelectedOutcome(null); try { const { data, remaining: rem } = await fetchOdds(SPORT_KEYS[sport], apiKey); setGames(data); setRemaining(rem); } catch (e) { setError(e.message); } finally { setLoading(false); } };
  const getFairOdds = (game, marketKey, outcomeName) => { const allOdds = {}; game.bookmakers.forEach(book => { const mkt = book.markets.find(m => m.key === marketKey); if (!mkt) return; mkt.outcomes.forEach(o => { if (!allOdds[o.name]) allOdds[o.name] = []; allOdds[o.name].push(o.price); }); }); const sides = Object.keys(allOdds); if (sides.length < 2) return null; const median = arr => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; }; const [sA, sB] = sides; const mA = median(allOdds[sA]), mB = median(allOdds[sB]); const nv = noVigFairOdds(mA, mB); return { ...nv, sideA: sA, sideB: sB, medA: mA, medB: mB, fairOdds: outcomeName === sA ? nv.fairOddsA : nv.fairOddsB, fairProb: outcomeName === sA ? nv.fairProbA : nv.fairProbB }; };
  const getBestOdds = (game, marketKey, outcomeName) => { let best = null; game.bookmakers.forEach(book => { const mkt = book.markets.find(m => m.key === marketKey); if (!mkt) return; const o = mkt.outcomes.find(x => x.name === outcomeName); if (!o) return; if (best === null || o.price > best.price) best = { price: o.price, book: book.title, point: o.point }; }); return best; };
  const getBookOdds = (game, marketKey, outcomeName) => { const r = []; game.bookmakers.forEach(book => { const mkt = book.markets.find(m => m.key === marketKey); if (!mkt) return; const o = mkt.outcomes.find(x => x.name === outcomeName); if (!o) return; r.push({ book: book.title, price: o.price, point: o.point }); }); return r.sort((a, b) => b.price - a.price); };
  const handleSelectOutcome = (game, outcomeName, marketKey) => { const fairData = getFairOdds(game, marketKey, outcomeName); const best = getBestOdds(game, marketKey, outcomeName); setSelectedOutcome({ game, outcomeName, marketKey, fairData, best }); };
  const handleBetThis = () => { if (!selectedOutcome) return; const { game, outcomeName, marketKey, best } = selectedOutcome; const betType = MARKET_LABELS[marketKey] || marketKey; const description = marketKey === "totals" ? `${outcomeName} ${best?.point ?? ""} (${game.home_team} vs ${game.away_team})` : `${outcomeName}${best?.point !== undefined ? ` ${best.point > 0 ? "+" : ""}${best.point}` : ""} vs ${outcomeName === game.home_team ? game.away_team : game.home_team}`; setEditBet({ sport, betType, book: best?.book || "", description, odds: best?.price || "", stake: Number(stake) || 100, result: "pending", notes: "", date: new Date().toISOString().split("T")[0] }); setActiveTab("log"); };
  const evResult = useMemo(() => { if (!selectedOutcome?.fairData || !selectedOutcome?.best || !validateOdds(String(selectedOutcome.best.price))) return null; return calcEV(selectedOutcome.best.price, selectedOutcome.fairData.fairOdds, Number(stake) || 100); }, [selectedOutcome, stake]);

  if (!apiKey) return (
    <div style={{ padding: 16 }}>
      <div style={{ fontFamily: "'Barlow Condensed'", fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Live Odds</div>
      <div style={{ fontSize: 13, color: C.textSecondary, marginBottom: 20, lineHeight: 1.6 }}>Enter your free API key from <span style={{ color: C.blue }}>the-odds-api.com</span> to pull live odds with automatic fair value calculation.</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div><label>API Key</label><input value={keyInput} onChange={e => setKeyInput(e.target.value)} placeholder="Paste your key here..." type="password" /></div>
        <button onClick={handleSaveKey} disabled={!keyInput.trim()} style={{ padding: "13px", background: C.blue, color: "#fff", fontSize: 15 }}>Save Key & Continue</button>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14, fontSize: 13, color: C.textSecondary, lineHeight: 1.6 }}><strong style={{ color: C.textPrimary }}>Free tier:</strong> 500 requests/month. Each sport fetch costs 3 credits. Your key is stored only in your browser.</div>
      </div>
    </div>
  );

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontFamily: "'Barlow Condensed'", fontSize: 22, fontWeight: 700 }}>Live Odds</div>
        <button onClick={() => { saveApiKey(""); setApiKey(""); }} style={{ fontSize: 11, padding: "5px 10px", background: "transparent", color: C.textSecondary, border: `1px solid ${C.border}` }}>Change Key</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
        <div><label>Sport</label><select value={sport} onChange={e => { setSport(e.target.value); setGames([]); setSelectedOutcome(null); }}>{SPORTS.map(s => <option key={s}>{s}</option>)}</select></div>
        <div><label>Market</label><select value={market} onChange={e => { setMarket(e.target.value); setSelectedOutcome(null); }}>{Object.entries(MARKET_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
      </div>
      <button onClick={handleFetch} disabled={loading} style={{ width: "100%", padding: "12px", background: C.blue, color: "#fff", fontSize: 14, marginBottom: 10 }}>{loading ? "Fetching odds..." : `Fetch ${sport} ${MARKET_LABELS[market]} Odds`}</button>
      {remaining !== null && <div style={{ fontSize: 11, color: C.textSecondary, marginBottom: 10, textAlign: "right" }}>{remaining} API credits remaining</div>}
      {error && <div style={{ background: "#2a1515", border: `1px solid ${C.red}`, borderRadius: 8, padding: "10px 12px", fontSize: 13, color: C.red, marginBottom: 10 }}>{error}</div>}
      {games.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
          {games.map(game => {
            const sides = market === "totals" ? ["Over", "Under"] : [game.away_team, game.home_team];
            return (
              <div key={game.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ fontSize: 12, color: C.textSecondary, marginBottom: 8 }}>{new Date(game.commence_time).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {sides.map(side => { const best = getBestOdds(game, market, side); const fairData = best ? getFairOdds(game, market, side) : null; const ev = (best && fairData) ? calcEV(best.price, fairData.fairOdds, 100) : null; const isSelected = selectedOutcome?.game.id === game.id && selectedOutcome?.outcomeName === side && selectedOutcome?.marketKey === market; return (<button key={side} onClick={() => handleSelectOutcome(game, side, market)} style={{ padding: "10px 8px", background: isSelected ? C.blue + "22" : C.bg, border: `1.5px solid ${isSelected ? C.blue : C.border}`, borderRadius: 8, textAlign: "left", display: "flex", flexDirection: "column", gap: 3 }}><div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.2 }}>{side}</div>{best && <><div style={{ fontFamily: "'Barlow Condensed'", fontSize: 20, fontWeight: 700 }}>{fmtOdds(best.price)}{best.point !== undefined ? ` (${best.point > 0 ? "+" : ""}${best.point})` : ""}</div><div style={{ fontSize: 11, color: C.textSecondary }}>Best: {best.book}</div>{ev !== null && <div style={{ fontSize: 11, fontWeight: 600, color: ev >= 0 ? C.green : C.red }}>{ev >= 0 ? "+" : ""}${ev.toFixed(2)} EV/$100</div>}</>}{!best && <div style={{ fontSize: 11, color: C.textSecondary }}>No odds</div>}</button>); })}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {selectedOutcome && selectedOutcome.fairData && (
        <div style={{ background: C.surface, border: `1.5px solid ${C.blue}`, borderRadius: 12, padding: 16, marginBottom: 14 }}>
          <div style={{ fontFamily: "'Barlow Condensed'", fontSize: 18, fontWeight: 700, marginBottom: 12 }}>{selectedOutcome.outcomeName} — {MARKET_LABELS[selectedOutcome.marketKey]}</div>
          <div style={{ background: C.bg, borderRadius: 8, padding: "10px 12px", marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: C.textSecondary, marginBottom: 6 }}>No-Vig Fair Line</div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
              <div><div style={{ color: C.textSecondary, fontSize: 11 }}>{selectedOutcome.fairData.sideA}</div><div style={{ fontFamily: "'Barlow Condensed'", fontSize: 20, fontWeight: 700 }}>{fmtOdds(selectedOutcome.fairData.fairOddsA)}</div><div style={{ fontSize: 11, color: C.textSecondary }}>{selectedOutcome.fairData.fairProbA}%</div></div>
              <div style={{ fontSize: 11, color: C.textSecondary, textAlign: "center", alignSelf: "center" }}><div>Vig</div><div style={{ fontWeight: 600, color: C.amber }}>{selectedOutcome.fairData.overround}%</div></div>
              <div style={{ textAlign: "right" }}><div style={{ color: C.textSecondary, fontSize: 11 }}>{selectedOutcome.fairData.sideB}</div><div style={{ fontFamily: "'Barlow Condensed'", fontSize: 20, fontWeight: 700 }}>{fmtOdds(selectedOutcome.fairData.fairOddsB)}</div><div style={{ fontSize: 11, color: C.textSecondary }}>{selectedOutcome.fairData.fairProbB}%</div></div>
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: C.textSecondary, marginBottom: 6 }}>Line by Book</div>
            {getBookOdds(selectedOutcome.game, selectedOutcome.marketKey, selectedOutcome.outcomeName).map((b, i) => { const ev = calcEV(b.price, selectedOutcome.fairData.fairOdds, 100); return (<div key={b.book} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${C.border}` }}><div style={{ fontSize: 13 }}>{i === 0 && <span style={{ fontSize: 10, background: C.green, color: C.bg, borderRadius: 4, padding: "1px 5px", marginRight: 6, fontWeight: 700 }}>BEST</span>}{b.book}</div><div style={{ display: "flex", gap: 12, alignItems: "center" }}><span style={{ fontFamily: "'Barlow Condensed'", fontSize: 16, fontWeight: 700 }}>{fmtOdds(b.price)}</span><span style={{ fontSize: 12, fontWeight: 600, color: ev >= 0 ? C.green : C.red, minWidth: 60, textAlign: "right" }}>{ev >= 0 ? "+" : ""}${ev.toFixed(2)} EV</span></div></div>); })}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div><label>Stake ($)</label><input type="number" value={stake} onChange={e => setStake(e.target.value)} placeholder="100" /></div>
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
              {evResult !== null && <div style={{ fontSize: 12, color: evResult >= 0 ? C.green : C.red, fontWeight: 600, marginBottom: 4 }}>EV: {evResult >= 0 ? "+" : ""}${evResult.toFixed(2)}</div>}
              <button onClick={handleBetThis} style={{ padding: "11px", background: C.green, color: C.bg, fontSize: 14 }}>Log This Bet →</button>
            </div>
          </div>
        </div>
      )}
      {games.length === 0 && !loading && !error && (<div style={{ textAlign: "center", padding: "30px 0", color: C.textSecondary, fontSize: 14 }}>Fetch odds to see upcoming {sport} games</div>)}
    </div>
  );
}

// ── EV CALC ───────────────────────────────────────────────────────────────────
function EVCalc() {
  const [form, setForm] = useState({ yourOdds: "", fairOdds: "", stake: "100" });
  const [altForm, setAltForm] = useState({ oddsA: "", oddsB: "", stake: "100", side: "A" });
  const [mode, setMode] = useState("manual");
  const [result, setResult] = useState(null);
  const [novigResult, setNovigResult] = useState(null);
  const setF = (k, v) => { setForm(f => ({ ...f, [k]: v })); setResult(null); };
  const setAF = (k, v) => { setAltForm(f => ({ ...f, [k]: v })); setNovigResult(null); };
  const calc = () => { if (!validateOdds(form.yourOdds) || !validateOdds(form.fairOdds) || !Number(form.stake)) return; const ev = calcEV(form.yourOdds, form.fairOdds, form.stake); const wp = americanToImplied(form.fairOdds); setResult({ ev, winProb: wp, profit: americanToProfit(form.yourOdds, form.stake), edge: wp - americanToImplied(form.yourOdds) }); };
  const calcNoVig = () => { if (!validateOdds(altForm.oddsA) || !validateOdds(altForm.oddsB) || !Number(altForm.stake)) return; const nv = noVigFairOdds(altForm.oddsA, altForm.oddsB); const yourOdds = altForm.side === "A" ? Number(altForm.oddsA) : Number(altForm.oddsB); const fairOdds = altForm.side === "A" ? nv.fairOddsA : nv.fairOddsB; const ev = calcEV(yourOdds, fairOdds, altForm.stake); setNovigResult({ ev, nv, yourOdds, fairOdds, profit: americanToProfit(yourOdds, altForm.stake), winProb: americanToImplied(fairOdds) }); };
  return (
    <div style={{ padding: 16 }}>
      <div style={{ fontFamily: "'Barlow Condensed'", fontSize: 22, fontWeight: 700, marginBottom: 4 }}>EV Calculator</div>
      <div style={{ fontSize: 13, color: C.textSecondary, marginBottom: 14, lineHeight: 1.5 }}>Find out if a bet is worth placing before you place it.</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 16 }}>
        {[["manual", "Manual (I have fair odds)"], ["novig", "No-Vig (auto-calculate)"]].map(([m, label]) => (<button key={m} onClick={() => setMode(m)} style={{ padding: "9px", fontSize: 12, background: mode === m ? C.blue : C.bg, color: mode === m ? "#fff" : C.textSecondary, border: `1px solid ${mode === m ? C.blue : C.border}`, borderRadius: 8 }}>{label}</button>))}
      </div>
      {mode === "manual" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div><label>Your Odds (from your book)</label><input value={form.yourOdds} onChange={e => setF("yourOdds", e.target.value)} placeholder="+110" />{validateOdds(form.yourOdds) && <div style={{ fontSize: 12, color: C.textSecondary, marginTop: 4 }}>Implied: {(americanToImplied(form.yourOdds) * 100).toFixed(1)}%</div>}</div>
          <div><label>Fair Odds (from Pinnacle or no-vig calc)</label><input value={form.fairOdds} onChange={e => setF("fairOdds", e.target.value)} placeholder="-105" />{validateOdds(form.fairOdds) && <div style={{ fontSize: 12, color: C.textSecondary, marginTop: 4 }}>True win prob: {(americanToImplied(form.fairOdds) * 100).toFixed(1)}%</div>}</div>
          <div><label>Stake ($)</label><input type="number" value={form.stake} onChange={e => setF("stake", e.target.value)} placeholder="100" /></div>
          <button onClick={calc} disabled={!validateOdds(form.yourOdds) || !validateOdds(form.fairOdds) || !Number(form.stake)} style={{ padding: "13px", fontSize: 15, background: C.blue, color: "#fff" }}>Calculate EV</button>
          {result && <EVResultCard result={result} stake={form.stake} />}
        </div>
      )}
      {mode === "novig" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px", fontSize: 13, color: C.textSecondary, lineHeight: 1.6 }}>Enter both sides from your book. We'll strip the vig and compute fair odds automatically.</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div><label>Side A Odds</label><input value={altForm.oddsA} onChange={e => setAF("oddsA", e.target.value)} placeholder="-115" /></div>
            <div><label>Side B Odds</label><input value={altForm.oddsB} onChange={e => setAF("oddsB", e.target.value)} placeholder="-105" /></div>
          </div>
          <div><label>Which side are you betting?</label><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>{["A", "B"].map(s => (<button key={s} onClick={() => setAF("side", s)} style={{ padding: "10px", background: altForm.side === s ? C.blue : C.bg, color: altForm.side === s ? "#fff" : C.textSecondary, border: `1px solid ${altForm.side === s ? C.blue : C.border}`, borderRadius: 8, fontSize: 14 }}>Side {s} ({s === "A" ? (validateOdds(altForm.oddsA) ? fmtOdds(altForm.oddsA) : "—") : (validateOdds(altForm.oddsB) ? fmtOdds(altForm.oddsB) : "—")})</button>))}</div></div>
          <div><label>Stake ($)</label><input type="number" value={altForm.stake} onChange={e => setAF("stake", e.target.value)} placeholder="100" /></div>
          <button onClick={calcNoVig} disabled={!validateOdds(altForm.oddsA) || !validateOdds(altForm.oddsB) || !Number(altForm.stake)} style={{ padding: "13px", fontSize: 15, background: C.blue, color: "#fff" }}>Calculate No-Vig EV</button>
          {novigResult && (
            <div style={{ background: C.surface, border: `1.5px solid ${novigResult.ev >= 0 ? C.green : C.red}`, borderRadius: 12, padding: 16 }}>
              <div style={{ textAlign: "center", marginBottom: 14, paddingBottom: 12, borderBottom: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 12, color: C.textSecondary, marginBottom: 4 }}>Expected Value</div>
                <div style={{ fontFamily: "'Barlow Condensed'", fontSize: 44, fontWeight: 700, color: novigResult.ev >= 0 ? C.green : C.red }}>{novigResult.ev >= 0 ? "+" : ""}${Math.abs(novigResult.ev).toFixed(2)}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: novigResult.ev >= 0 ? C.green : C.red, marginTop: 4 }}>{novigResult.ev >= 0 ? "✓ Positive EV" : "✗ Negative EV"}</div>
              </div>
              {[["Book overround (vig)", novigResult.nv.overround + "%"], ["Fair odds for your side", fmtOdds(novigResult.fairOdds)], ["True win probability", novigResult.nv[altForm.side === "A" ? "fairProbA" : "fairProbB"] + "%"], ["Your odds", fmtOdds(novigResult.yourOdds)]].map(([l, v]) => (<div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${C.border}`, fontSize: 13 }}><span style={{ color: C.textSecondary }}>{l}</span><span style={{ fontWeight: 600 }}>{v}</span></div>))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EVResultCard({ result, stake }) {
  return (
    <div style={{ background: C.surface, border: `1.5px solid ${result.ev >= 0 ? C.green : C.red}`, borderRadius: 12, padding: 16 }}>
      <div style={{ textAlign: "center", marginBottom: 14, paddingBottom: 12, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 12, color: C.textSecondary, marginBottom: 4 }}>Expected Value</div>
        <div style={{ fontFamily: "'Barlow Condensed'", fontSize: 44, fontWeight: 700, color: result.ev >= 0 ? C.green : C.red }}>{result.ev >= 0 ? "+" : ""}${Math.abs(result.ev).toFixed(2)}</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: result.ev >= 0 ? C.green : C.red, marginTop: 4 }}>{result.ev >= 0 ? "✓ Positive EV — you have an edge" : "✗ Negative EV — book has the edge"}</div>
      </div>
      {[["True win probability", `${(result.winProb * 100).toFixed(1)}%`, "From fair odds"], ["If you win", `+$${result.profit.toFixed(2)}`, `${(result.winProb * 100).toFixed(1)}% chance`], ["If you lose", `-$${Number(stake).toFixed(2)}`, `${((1 - result.winProb) * 100).toFixed(1)}% chance`], ["Your edge", `${result.edge >= 0 ? "+" : ""}${(result.edge * 100).toFixed(2)}%`, result.edge >= 0 ? "Getting a good number" : "Book has an edge"]].map(([label, val, sub]) => (<div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${C.border}` }}><div><div style={{ fontSize: 13 }}>{label}</div><div style={{ fontSize: 11, color: C.textSecondary }}>{sub}</div></div><div style={{ fontWeight: 600 }}>{val}</div></div>))}
    </div>
  );
}

// ── INSIGHTS SCREEN ───────────────────────────────────────────────────────────
function Insights({ bets }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const bottomRef = useRef(null);
  const data = useMemo(() => buildInsightSummary(bets), [bets]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  const systemPrompt = !data ? "" : `You are SharpAdvisor, a sharp, no-nonsense betting analyst built into SharpTrack. You speak directly and concisely — like a smart friend who knows sports betting, not a corporate chatbot. You give honest, data-driven takes and concrete recommendations. Never hedge excessively or pad with disclaimers. Treat the user as an adult who can handle honest feedback.

Here is the user's complete betting history summary:

OVERALL
- Net P&L: ${fmtMoney(data.netPL)}
- ROI: ${data.roi.toFixed(1)}%
- Win rate: ${data.winRate !== null ? data.winRate.toFixed(1) + "%" : "N/A"}
- Total bets: ${data.totalBets} (${data.settledCount} settled)
- Total wagered: $${data.wagered.toFixed(0)}

BY SPORT (min 2 settled bets):
${data.bySport.map(s => `- ${s.key}: ${s.wins}W-${s.losses}L, ROI ${s.roi.toFixed(1)}%, P&L ${fmtMoney(s.pl)}`).join("\n") || "Not enough data"}

BY BET TYPE (min 2 settled bets):
${data.byType.map(t => `- ${t.key}: ${t.wins}W-${t.losses}L, ROI ${t.roi.toFixed(1)}%, P&L ${fmtMoney(t.pl)}`).join("\n") || "Not enough data"}

BY BOOK (min 2 settled bets):
${data.byBook.map(b => `- ${b.key}: ${b.wins}W-${b.losses}L, ROI ${b.roi.toFixed(1)}%, P&L ${fmtMoney(b.pl)}`).join("\n") || "Not enough data"}

STREAK
- Current: ${data.streak.current} ${data.streak.currentType || "—"}${data.streak.current > 1 ? " streak" : ""}
- Longest: ${data.streak.longest} ${data.streak.longestType || "—"} streak

CHASING SIGNAL
${data.chasing ? `- Avg stake after a WIN: $${data.chasing.avgAfterWin.toFixed(0)}
- Avg stake after a LOSS: $${data.chasing.avgAfterLoss.toFixed(0)}
- Chasing detected: ${data.chasing.chasing ? "YES — stakes meaningfully higher after losses" : "No — stake sizing is consistent"}` : "Not enough data"}

BEST BET: ${data.best ? `${data.best.sport} ${data.best.betType} at ${fmtOdds(data.best.odds)} (${fmtMoney(data.best.pl)})` : "N/A"}
WORST BET: ${data.worst ? `${data.worst.sport} ${data.worst.betType} at ${fmtOdds(data.worst.odds)} (${fmtMoney(data.worst.pl)})` : "N/A"}

Keep responses concise — 3 to 6 sentences unless the user asks for detail. Format as plain prose, no markdown bullet points or headers. If you make a recommendation, be specific about what to do or stop doing.`;

  const getInitialAnalysis = async () => {
    if (!data || initializing || messages.length > 0) return;
    setInitializing(true);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          system: systemPrompt,
          messages: [{ role: "user", content: "Give me a quick honest read on my betting performance. What's working, what isn't, and the one thing I should change." }]
        })
      });
      const json = await res.json();
      const text = json.content?.[0]?.text || "Couldn't generate analysis right now.";
      setMessages([{ role: "assistant", content: text }]);
    } catch { setMessages([{ role: "assistant", content: "Couldn't connect to the advisor right now. Try again in a moment." }]); }
    finally { setInitializing(false); }
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg = { role: "user", content: input.trim() };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          system: systemPrompt,
          messages: updated.map(m => ({ role: m.role, content: m.content }))
        })
      });
      const json = await res.json();
      const text = json.content?.[0]?.text || "Couldn't get a response right now.";
      setMessages(prev => [...prev, { role: "assistant", content: text }]);
    } catch { setMessages(prev => [...prev, { role: "assistant", content: "Something went wrong. Try again." }]); }
    finally { setLoading(false); }
  };

  if (!data) return (
    <div style={{ padding: 24, textAlign: "center" }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>🧠</div>
      <div style={{ fontFamily: "'Barlow Condensed'", fontSize: 22, color: C.textSecondary }}>Not enough data yet</div>
      <div style={{ fontSize: 14, color: C.textSecondary, marginTop: 8 }}>Log at least 3 settled bets to unlock insights and the AI advisor.</div>
    </div>
  );

  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>

      {/* Stat cards — sport */}
      {data.bySport.length > 0 && (
        <InsightSection title="By Sport">
          <RoiBar items={data.bySport} />
        </InsightSection>
      )}

      {/* Stat cards — bet type */}
      {data.byType.length > 0 && (
        <InsightSection title="By Bet Type">
          <RoiBar items={data.byType} />
        </InsightSection>
      )}

      {/* Stat cards — book */}
      {data.byBook.length > 0 && (
        <InsightSection title="By Sportsbook">
          <RoiBar items={data.byBook} />
        </InsightSection>
      )}

      {/* Streak + chasing */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <StatCard
          label="Current Streak"
          value={data.streak.current > 0 ? `${data.streak.current} ${data.streak.currentType === "win" ? "W" : "L"}` : "—"}
          sub={`Longest: ${data.streak.longest} ${data.streak.longestType === "win" ? "win" : "loss"} streak`}
          color={data.streak.currentType === "win" ? C.green : data.streak.currentType === "loss" ? C.red : undefined}
        />
        {data.chasing ? (
          <StatCard
            label="Stake Consistency"
            value={data.chasing.chasing ? "⚠ Chasing" : "✓ Steady"}
            sub={`After W: $${data.chasing.avgAfterWin.toFixed(0)} · After L: $${data.chasing.avgAfterLoss.toFixed(0)}`}
            color={data.chasing.chasing ? C.amber : C.green}
            small
          />
        ) : <StatCard label="Stake Consistency" value="—" sub="Need more bets" />}
      </div>

      {/* Best / worst */}
      {(data.best || data.worst) && (
        <InsightSection title="Extremes">
          {data.best && <BetHighlight label="Best bet" bet={data.best} color={C.green} />}
          {data.worst && <BetHighlight label="Worst bet" bet={data.worst} color={C.red} />}
        </InsightSection>
      )}

      {/* AI Advisor */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontFamily: "'Barlow Condensed'", fontSize: 17, fontWeight: 700 }}>SharpAdvisor</div>
            <div style={{ fontSize: 11, color: C.textSecondary }}>AI · reads your actual bet history</div>
          </div>
          {messages.length === 0 && !initializing && (
            <button onClick={getInitialAnalysis} style={{ padding: "7px 14px", background: C.blue, color: "#fff", fontSize: 12 }}>Analyze my bets</button>
          )}
        </div>

        {/* Chat messages */}
        {(messages.length > 0 || initializing) && (
          <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 12, maxHeight: 340, overflowY: "auto" }}>
            {initializing && (
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: C.blue + "33", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>🎯</div>
                <div style={{ fontSize: 13, color: C.textSecondary, animation: "pulse 1.5s ease-in-out infinite" }}>Analyzing your betting history...</div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className="msg-appear" style={{ display: "flex", gap: 8, alignItems: "flex-start", flexDirection: m.role === "user" ? "row-reverse" : "row" }}>
                {m.role === "assistant" && <div style={{ width: 28, height: 28, borderRadius: "50%", background: C.blue + "33", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>🎯</div>}
                <div style={{ maxWidth: "82%", background: m.role === "user" ? C.blue + "22" : C.bg, border: `1px solid ${m.role === "user" ? C.blue + "44" : C.border}`, borderRadius: m.role === "user" ? "12px 12px 4px 12px" : "12px 12px 12px 4px", padding: "10px 13px", fontSize: 13, lineHeight: 1.55, color: C.textPrimary }}>
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: C.blue + "33", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>🎯</div>
                <div style={{ fontSize: 13, color: C.textSecondary, animation: "pulse 1.5s ease-in-out infinite" }}>Thinking...</div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}

        {/* Input */}
        {messages.length > 0 && (
          <div style={{ padding: "10px 12px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 8 }}>
            <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMessage()} placeholder="Ask anything about your bets..." style={{ flex: 1, fontSize: 13, padding: "9px 12px" }} />
            <button onClick={sendMessage} disabled={loading || !input.trim()} style={{ padding: "9px 14px", background: C.blue, color: "#fff", fontSize: 13, flexShrink: 0 }}>Send</button>
          </div>
        )}

        {messages.length === 0 && !initializing && (
          <div style={{ padding: "16px", fontSize: 13, color: C.textSecondary, lineHeight: 1.6 }}>
            SharpAdvisor reads your full bet history and gives you an honest, data-driven analysis — what's working, what's hurting you, and what to do about it. Tap "Analyze my bets" to start, then ask it anything.
          </div>
        )}
      </div>

      <div style={{ height: 8 }} />
    </div>
  );
}

function InsightSection({ title, children }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ fontSize: 12, color: C.textSecondary, marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  );
}

function RoiBar({ items }) {
  const max = Math.max(...items.map(i => Math.abs(i.roi)), 10);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {items.map(item => (
        <div key={item.key}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 13 }}>
            <span style={{ fontWeight: 600 }}>{item.key}</span>
            <div style={{ display: "flex", gap: 10, fontSize: 12 }}>
              <span style={{ color: C.textSecondary }}>{item.wins}W-{item.losses}L</span>
              <span style={{ fontWeight: 600, color: item.roi >= 0 ? C.green : C.red }}>{item.roi >= 0 ? "+" : ""}{item.roi.toFixed(1)}% ROI</span>
            </div>
          </div>
          <div style={{ height: 6, background: C.border, borderRadius: 3, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.min(Math.abs(item.roi) / max * 100, 100)}%`, background: item.roi >= 0 ? C.green : C.red, borderRadius: 3, transition: "width .4s ease" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function BetHighlight({ label, bet, color }) {
  const pl = bet.result === "win" ? americanToProfit(bet.odds, bet.stake) : -Number(bet.stake);
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
      <div>
        <div style={{ fontSize: 11, color: C.textSecondary, marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{bet.description || `${bet.sport} ${bet.betType}`}</div>
        <div style={{ fontSize: 11, color: C.textSecondary }}>{bet.sport} · {fmtOdds(bet.odds)} · ${Number(bet.stake).toFixed(0)} stake</div>
      </div>
      <div style={{ fontFamily: "'Barlow Condensed'", fontSize: 20, fontWeight: 700, color }}>{fmtMoney(pl)}</div>
    </div>
  );
}

// ── ROOT ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [bets, setBets] = useState(loadBets);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [editBet, setEditBet] = useState(null);
  const [apiKey, setApiKey] = useState(loadApiKey);
  const netPL = calcNetPL(bets);
  const handleEdit = (bet) => { setEditBet(bet); setActiveTab("log"); };
  const tabs = [
    { id: "dashboard", label: "Dashboard", icon: "📊" },
    { id: "odds", label: "Odds", icon: "📡" },
    { id: "log", label: "Log", icon: "➕" },
    { id: "history", label: "History", icon: "📋" },
    { id: "insights", label: "Insights", icon: "🧠" },
    { id: "ev", label: "EV", icon: "🎯" },
  ];
  return (
    <>
      <style>{css}</style>
      <div style={{ maxWidth: 480, margin: "0 auto", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
        <Ticker netPL={netPL} totalBets={bets.length} />
        <div style={{ flex: 1, overflowY: "auto", paddingBottom: 70 }}>
          {activeTab === "dashboard" && <Dashboard bets={bets} />}
          {activeTab === "odds" && <OddsScreen apiKey={apiKey} setApiKey={setApiKey} setActiveTab={setActiveTab} setEditBet={setEditBet} />}
          {activeTab === "log" && <LogBet bets={bets} setBets={setBets} editBet={editBet} setEditBet={setEditBet} setActiveTab={setActiveTab} />}
          {activeTab === "history" && <History bets={bets} onEdit={handleEdit} />}
          {activeTab === "insights" && <Insights bets={bets} />}
          {activeTab === "ev" && <EVCalc />}
        </div>
        <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, background: C.surface, borderTop: `1px solid ${C.border}`, display: "flex", zIndex: 100 }}>
          {tabs.map(t => { const active = activeTab === t.id; return (<button key={t.id} onClick={() => { setActiveTab(t.id); if (t.id !== "log") setEditBet(null); }} style={{ flex: 1, padding: "10px 2px 12px", background: "transparent", color: active ? C.green : C.textSecondary, fontSize: 9, fontWeight: active ? 600 : 400, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, borderRadius: 0, letterSpacing: ".02em", textTransform: "uppercase" }}><span style={{ fontSize: 17 }}>{t.icon}</span>{t.label}</button>); })}
        </div>
      </div>
    </>
  );

}
