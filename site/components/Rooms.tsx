"use client";
import { useEffect, useState } from "react";
import { countRooms, getRooms, type Progress, type Room, type RoomsReply } from "@/lib/api";

/** 🔎 How many right answers does this dinner have? — course II.
 *  Ten rooms. Tap the ones you think feed everyone at this table, then
 *  count. The kitchen walks all ten with world.everyone_ate (no model, no
 *  golden answer) and shows the real set. The count is course II's receipt. */
export default function Rooms({ party, p, onCounted }: { party: string; p: Progress | null; onCounted: () => void }) {
  const [data, setData] = useState<RoomsReply | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [result, setResult] = useState<{ actual: string[]; hit: string[]; missed: string[]; extra: string[] } | null>(null);
  const [busy, setBusy] = useState(false);

  const lastTs = (p?.rooms || []).filter((r) => r.party === party).slice(-1)[0]?.ts ?? null;
  useEffect(() => {
    setResult(null); setPicked([]);
    getRooms(party).then((d) => {
      setData(d);
      // a count you already made for this party comes back revealed — the receipt is the kitchen's, not the tab's
      const prev = (p?.rooms || []).filter((r) => r.party === party).slice(-1)[0];
      if (prev) { setPicked(prev.picked); setResult({ actual: prev.actual, hit: prev.hit, missed: prev.missed, extra: prev.extra }); }
    }).catch(() => setData(null));
  }, [party, lastTs]);   // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id: string) => { if (result) return; setPicked((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]); };
  const count = async () => {
    setBusy(true);
    try { const r = await countRooms(party, picked); setResult({ actual: r.actual, hit: r.hit, missed: r.missed, extra: r.extra }); setData((d) => d ? { ...d, rooms: r.rooms } : d); onCounted(); }
    catch (e) { alert((e as Error).message); }
    finally { setBusy(false); }
  };
  const rooms: Room[] = data?.rooms || [];
  const revealed = Boolean(result);
  const across = data?.across_holdout || {};

  return (
    <div className="rooms">
      <div className="k">🔎 HOW MANY RIGHT ANSWERS DOES THIS DINNER HAVE? · party {party}</div>
      <div className="hint">{revealed
        ? <>The real set for this table: <b>{result!.actual.length} of {rooms.length}</b> rooms feed everyone{result!.actual.length ? <> — {result!.actual.map((id) => rooms.find((r) => r.id === id)?.name).join(", ")}</> : ""}. You picked {picked.length}: <b>{result!.hit.length} right</b>{result!.missed.length ? <>, missed {result!.missed.length}</> : ""}{result!.extra.length ? <>, {result!.extra.length} that leave someone hungry</> : ""}. Hover a room for who, and why.</>
        : <>Tap every room you think feeds <i>everyone</i> at this table — the brief is in the workbench (📋 copy the brief). Then count. Ten rooms, one hard constraint per guest; nothing here calls a model.</>}</div>
      <div className="grid">
        {rooms.map((r) => {
          const on = picked.includes(r.id);
          const cls = "room" + (on ? " on" : "") + (revealed ? (r.feeds_everyone ? " yes" : on ? " no" : " dim") : "");
          return (
            <button key={r.id} className={cls} onClick={() => toggle(r.id)} disabled={revealed}
              title={revealed ? (r.feeds_everyone ? `feeds everyone at ${r.time}` : r.whys.join("\n")) : r.tag}>
              <span className="nm">{r.name}</span>
              <span className="meta">★{r.rating.toFixed(1)} · ~${r.price}</span>
              {revealed && <span className="vd">{r.feeds_everyone ? `✓ everyone eats · ${r.time}` : `✗ ${r.hungry.join(", ")} hungry`}</span>}
            </button>
          );
        })}
      </div>
      <div className="opts">
        {!revealed
          ? <button className="btn gold" disabled={busy || !rooms.length} onClick={count}>🔎 count the rooms{picked.length ? ` · ${picked.length} picked` : ""}</button>
          : <button className="btn" onClick={() => { setResult(null); setPicked([]); }}>↺ guess again</button>}
        {revealed && Object.keys(across).length > 0 && (
          <span className="art">across the exam’s eight parties: {Object.entries(across).map(([pid, n]) => `${pid} ${n}`).join(" · ")} rooms — a <b>set</b> of right answers every time, never one. And a golden answer is one of them.</span>
        )}
      </div>
    </div>
  );
}
