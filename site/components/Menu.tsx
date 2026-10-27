"use client";
import { SEATINGS, coursesOf, isCheck, seatingOf, type SeatingNo } from "@/lib/courses";

/** Tonight's menu: two seatings — the host's eight courses, then the maître
 *  d's four. The rail shows one seating at a time; the switch on the left
 *  changes it. A plate fills when a course is proven — empty · cutlery (you
 *  are here) · the dish (done). */
const Plate = ({ state }: { state: "" | "now" | "done" }) => (
  <svg className="plate" viewBox="0 0 34 34">
    <circle className="rim" cx="17" cy="17" r="15" /><circle className="well" cx="17" cy="17" r="10.5" />
    {state === "done" && <><circle cx="17" cy="17" r="6.5" fill="#D9A441" /><circle cx="15" cy="15.5" r="2.4" fill="#7FA86B" /><circle cx="19.5" cy="18.5" r="2" fill="#D9603F" /></>}
    {state === "now" && <><path d="M11 9 v16 M13.5 9 v6 M9 9 v6 M11 15 c-2 0 -2 -2 -2 -2" stroke="#6F7F3F" strokeWidth="1.4" fill="none" strokeLinecap="round" /><path d="M23 9 c-2.5 0 -2.5 7 0 7 v9" stroke="#6F7F3F" strokeWidth="1.4" fill="none" strokeLinecap="round" /></>}
  </svg>
);

export default function Menu({ current, lit, onPick }: { current: number; lit: Record<string, boolean>; onPick: (n: number) => void }) {
  const seating = seatingOf(current);
  // a seating is served when every course in it but its check is lit
  const served = (s: SeatingNo) => coursesOf(s).filter((c) => !isCheck(c.key)).every((c) => lit[String(c.n)]);
  return (
    <div className="card menu">
      <div className="lbl">Tonight’s<br />menu<small>{SEATINGS[seating].count}</small>
        <div className="seatings">
          {([1, 2] as SeatingNo[]).map((s) => (
            <button key={s} className={(s === seating ? "on" : "") + (served(s) ? " served" : "")} onClick={() => onPick(coursesOf(s)[0].n)}
              title={`the ${SEATINGS[s].label} · ${SEATINGS[s].count.toLowerCase()} · ${s === 1 ? "the host" : "the maître d’"}`}>
              {s === 1 ? "first" : "second"}
            </button>
          ))}
        </div>
      </div>
      <div className="courses">
        {coursesOf(seating).map((c) => {
          const done = Boolean(lit[String(c.n)]);
          return (
            <button key={c.n} className={"course" + (c.n === current ? " now" : "") + (done ? " done" : "")} onClick={() => onPick(c.n)}>
              <Plate state={c.n === current ? "now" : done ? "done" : ""} />
              <div><div className="n">COURSE {c.r}</div><div className="t">{c.t}</div></div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
