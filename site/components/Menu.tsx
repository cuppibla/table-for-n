"use client";
import { COURSES } from "@/lib/courses";

/** Tonight's menu: eight courses. A plate fills when a course is proven —
 *  empty · cutlery (you are here) · the dish (done). */
const Plate = ({ state }: { state: "" | "now" | "done" }) => (
  <svg className="plate" viewBox="0 0 34 34">
    <circle className="rim" cx="17" cy="17" r="15" /><circle className="well" cx="17" cy="17" r="10.5" />
    {state === "done" && <><circle cx="17" cy="17" r="6.5" fill="#D9A441" /><circle cx="15" cy="15.5" r="2.4" fill="#7FA86B" /><circle cx="19.5" cy="18.5" r="2" fill="#D9603F" /></>}
    {state === "now" && <><path d="M11 9 v16 M13.5 9 v6 M9 9 v6 M11 15 c-2 0 -2 -2 -2 -2" stroke="#6F7F3F" strokeWidth="1.4" fill="none" strokeLinecap="round" /><path d="M23 9 c-2.5 0 -2.5 7 0 7 v9" stroke="#6F7F3F" strokeWidth="1.4" fill="none" strokeLinecap="round" /></>}
  </svg>
);

export default function Menu({ current, lit, onPick }: { current: number; lit: Record<string, boolean>; onPick: (n: number) => void }) {
  return (
    <div className="card menu">
      <div className="lbl">Tonight’s<br />menu<small>TEN COURSES</small></div>
      <div className="courses">
        {COURSES.map((c) => {
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
