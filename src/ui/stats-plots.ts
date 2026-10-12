// SVG plots for the Stats tab: forest plot and scatter plot.

import { h } from "./dom";
import { fmt } from "./stats-ui";
import type { MetaResult, Scale } from "../stats/meta";

const SVG = "http://www.w3.org/2000/svg";
function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, text?: string): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (text !== undefined) e.textContent = text;
  return e;
}

export function forestPlot(m: MetaResult, scale: Scale, measure: string): HTMLElement {
  const rowH = 26;
  const labelW = 190;
  const plotW = 300;
  const valueW = 150;
  const W = labelW + plotW + valueW;
  const top = 30;
  const rows = m.studies.length;
  const H = top + (rows + 3) * rowH + 40;
  const tx = scale === "ratio" ? Math.log : (v: number) => v;
  const all = [...m.studies.flatMap((s) => [s.lo, s.hi]), m.random.lo, m.random.hi, m.fixed.lo, m.fixed.hi];
  const nullValue = scale === "ratio" ? 1 : 0;
  let lo = Math.min(...all.map(tx), tx(nullValue));
  let hi = Math.max(...all.map(tx), tx(nullValue));
  const pad = (hi - lo) * 0.06 || 0.5;
  lo -= pad;
  hi += pad;
  const x = (v: number) => labelW + ((tx(v) - lo) / (hi - lo)) * plotW;

  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", class: "chart forest", "aria-label": `Forest plot of ${measure}` });
  svg.append(el("text", { x: 4, y: 18, class: "tick strong" }, "Study"), el("text", { x: labelW + plotW + 8, y: 18, class: "tick strong" }, `${measure} (95% CI)`));
  // Reference line at no effect.
  svg.append(el("line", { x1: x(nullValue), x2: x(nullValue), y1: top - 6, y2: top + (rows + 2) * rowH + 14, class: "axis" }));

  const maxW = Math.max(...m.studies.map((s) => s.wRandom));
  m.studies.forEach((s, i) => {
    const y = top + i * rowH + rowH / 2;
    const size = 5 + (s.wRandom / maxW) * 6;
    svg.append(
      el("text", { x: 4, y: y + 4, class: "tick" }, s.label.length > 28 ? `${s.label.slice(0, 27)}…` : s.label),
      el("line", { x1: x(s.lo), x2: x(s.hi), y1: y, y2: y, class: "ci" }),
      el("rect", { x: x(s.est) - size / 2, y: y - size / 2, width: size, height: size, class: "box" }),
      el("text", { x: labelW + plotW + 8, y: y + 4, class: "tick" }, `${fmt(s.est)} (${fmt(s.lo)} to ${fmt(s.hi)})`),
    );
  });
  const diamond = (p: { est: number; lo: number; hi: number }, row: number, label: string, cls: string) => {
    const y = top + row * rowH + rowH / 2;
    svg.append(
      el("text", { x: 4, y: y + 4, class: "tick strong" }, label),
      el("polygon", { points: `${x(p.lo)},${y} ${x(p.est)},${y - 7} ${x(p.hi)},${y} ${x(p.est)},${y + 7}`, class: cls }),
      el("text", { x: labelW + plotW + 8, y: y + 4, class: "tick strong" }, `${fmt(p.est)} (${fmt(p.lo)} to ${fmt(p.hi)})`),
    );
  };
  diamond(m.fixed, rows + 0.5, "Fixed effect", "diamond fixed");
  diamond(m.random, rows + 1.5, "Random effects", "diamond");

  // Axis ticks.
  const axisY = top + (rows + 2) * rowH + 14;
  svg.append(el("line", { x1: labelW, x2: labelW + plotW, y1: axisY, y2: axisY, class: "axis" }));
  const ticks = scale === "ratio" ? [0.1, 0.25, 0.5, 1, 2, 4, 10].filter((t) => tx(t) >= lo && tx(t) <= hi) : niceTicks(lo, hi);
  for (const t of ticks) svg.append(el("text", { x: x(t), y: axisY + 16, class: "tick", "text-anchor": "middle" }, String(t)));

  return h("figure", { className: "chart-figure" }, h("div", { className: "chart-wrap forest-wrap" }, svg));
}

function niceTicks(lo: number, hi: number): number[] {
  const raw = (hi - lo) / 5;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) out.push(Math.round(v / step) * step);
  return out;
}

export function scatterPlot(xs: number[], ys: number[], xLabel: string, yLabel: string, line: { slope: number; intercept: number } | null): HTMLElement {
  const W = 480;
  const H = 300;
  const pad = { l: 48, r: 12, t: 12, b: 38 };
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  const sx = (v: number) => pad.l + ((v - x0) / (x1 - x0 || 1)) * (W - pad.l - pad.r);
  const sy = (v: number) => H - pad.b - ((v - y0) / (y1 - y0 || 1)) * (H - pad.t - pad.b);
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", class: "chart", "aria-label": `${yLabel} against ${xLabel}` });
  svg.append(el("line", { x1: pad.l, x2: W - pad.r, y1: H - pad.b, y2: H - pad.b, class: "axis" }), el("line", { x1: pad.l, x2: pad.l, y1: pad.t, y2: H - pad.b, class: "axis" }));
  for (const v of [x0, x1]) svg.append(el("text", { x: sx(v), y: H - pad.b + 14, class: "tick", "text-anchor": "middle" }, fmt(v)));
  for (const v of [y0, y1]) svg.append(el("text", { x: pad.l - 6, y: sy(v) + 4, class: "tick", "text-anchor": "end" }, fmt(v)));
  svg.append(el("text", { x: (pad.l + W - pad.r) / 2, y: H - 6, class: "tick", "text-anchor": "middle" }, xLabel));
  const yl = el("text", { x: 12, y: (pad.t + H - pad.b) / 2, class: "tick", "text-anchor": "middle", transform: `rotate(-90 12 ${(pad.t + H - pad.b) / 2})` }, yLabel);
  svg.append(yl);
  if (line) svg.append(el("line", { x1: sx(x0), y1: sy(line.intercept + line.slope * x0), x2: sx(x1), y2: sy(line.intercept + line.slope * x1), class: "fitline" }));
  // Thin out very large data sets so the SVG stays light.
  const step = Math.ceil(xs.length / 1500);
  xs.forEach((v, i) => {
    if (i % step === 0) svg.append(el("circle", { cx: sx(v), cy: sy(ys[i]), r: 3, class: "dot" }));
  });
  return h("figure", { className: "chart-figure" }, h("div", { className: "chart-wrap" }, svg));
}
