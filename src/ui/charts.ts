// Small single-series charts drawn as inline SVG: columns (papers per year)
// and horizontal bars (top journals). One accent hue, hairline grid, value on
// hover, and a table view for every chart.

import { h } from "./dom";
import type { Count } from "../search/trends";

const SVG = "http://www.w3.org/2000/svg";

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

// Clean axis maximum and tick step (1, 2, 5 × 10^n).
function niceScale(max: number, ticks = 4): { top: number; step: number } {
  if (max <= 0) return { top: 1, step: 1 };
  const raw = max / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  return { top: Math.ceil(max / step) * step, step: Math.max(1, step) };
}

function tableView(caption: string, rows: Count[], unit: string): HTMLElement {
  return h(
    "details",
    { className: "table-view" },
    h("summary", {}, "Show as table"),
    h(
      "table",
      {},
      h("caption", { className: "sr-only" }, caption),
      h("thead", {}, h("tr", {}, h("th", { scope: "col" }, caption.split(" per ")[1] ?? "Label"), h("th", { scope: "col" }, unit))),
      h("tbody", {}, ...rows.map((r) => h("tr", {}, h("td", {}, r.label), h("td", { className: "num" }, r.count.toLocaleString())))),
    ),
  );
}

// Rounded-top column path, square at the baseline.
function columnPath(x: number, y: number, w: number, hgt: number): string {
  const r = Math.min(4, w / 2, hgt);
  return `M${x},${y + hgt}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + hgt}Z`;
}

export function columnChart(opts: { title: string; data: Count[]; unit: string; tableCaption: string }): HTMLElement {
  const { data } = opts;
  const W = 640;
  const H = 220;
  const pad = { top: 12, right: 8, bottom: 26, left: 40 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;
  const { top, step } = niceScale(Math.max(...data.map((d) => d.count), 1));
  const band = innerW / Math.max(data.length, 1);
  const barW = Math.min(24, Math.max(2, band - 2));
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": opts.title, class: "chart" });

  for (let v = 0; v <= top; v += step) {
    const y = pad.top + innerH - (v / top) * innerH;
    svg.append(svgEl("line", { x1: pad.left, x2: W - pad.right, y1: y, y2: y, class: v === 0 ? "axis" : "grid" }));
    const t = svgEl("text", { x: pad.left - 6, y: y + 4, class: "tick", "text-anchor": "end" });
    t.textContent = v.toLocaleString();
    svg.append(t);
  }

  const tooltip = h("div", { className: "chart-tooltip", role: "status", hidden: true });
  const labelEvery = Math.ceil(data.length / 10);
  data.forEach((d, i) => {
    const x = pad.left + i * band + (band - barW) / 2;
    const hgt = (d.count / top) * innerH;
    const y = pad.top + innerH - hgt;
    const g = svgEl("g", { class: "col", tabindex: 0, "aria-label": `${d.label}: ${d.count} ${opts.unit}` });
    if (hgt > 0) g.append(svgEl("path", { d: columnPath(x, y, barW, hgt), class: "bar" }));
    // Full-height hit target, larger than the mark.
    g.append(svgEl("rect", { x: pad.left + i * band, y: pad.top, width: band, height: innerH, class: "hit" }));
    const show = () => {
      tooltip.hidden = false;
      tooltip.textContent = `${d.label}: ${d.count.toLocaleString()} ${opts.unit}`;
      tooltip.style.left = `${((x + barW / 2) / W) * 100}%`;
      tooltip.style.top = `${(Math.max(y, pad.top + 8) / H) * 100}%`;
      g.classList.add("hover");
    };
    const hide = () => {
      tooltip.hidden = true;
      g.classList.remove("hover");
    };
    g.addEventListener("mouseenter", show);
    g.addEventListener("focus", show);
    g.addEventListener("mouseleave", hide);
    g.addEventListener("blur", hide);
    svg.append(g);
    if (i % labelEvery === 0 || i === data.length - 1) {
      const t = svgEl("text", { x: x + barW / 2, y: H - 8, class: "tick", "text-anchor": "middle" });
      t.textContent = d.label;
      svg.append(t);
    }
  });

  return h(
    "figure",
    { className: "chart-figure" },
    h("figcaption", {}, opts.title),
    h("div", { className: "chart-wrap" }, svg, tooltip),
    tableView(opts.tableCaption, data, opts.unit),
  );
}

export function barList(opts: { title: string; data: Count[]; unit: string; tableCaption: string }): HTMLElement {
  const max = Math.max(...opts.data.map((d) => d.count), 1);
  return h(
    "figure",
    { className: "chart-figure" },
    h("figcaption", {}, opts.title),
    h(
      "ol",
      { className: "bars" },
      ...opts.data.map((d) =>
        h(
          "li",
          { className: "bar-row static", title: `${d.label}: ${d.count} ${opts.unit}` },
          h("span", { className: "bar-label" }, d.label),
          h("span", { className: "bar-track" }, h("span", { className: "bar-fill accent", style: `width:${((d.count / max) * 100).toFixed(1)}%` })),
          h("span", { className: "bar-value" }, d.count.toLocaleString()),
        ),
      ),
    ),
    tableView(opts.tableCaption, opts.data, opts.unit),
  );
}
