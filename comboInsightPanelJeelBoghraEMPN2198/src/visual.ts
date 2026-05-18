"use strict";

import powerbi from "powerbi-visuals-api";
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions   = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual               = powerbi.extensibility.visual.IVisual;
import DataView              = powerbi.DataView;

import "./../style/visual.less";

// ─── Colour palette (bar + donut slices) ──────────────────────────────────────
const PALETTE = [
    ["#f953c6","#b91d73"],
    ["#43e97b","#38f9d7"],
    ["#4facfe","#00f2fe"],
    ["#fa709a","#fee140"],
    ["#a18cd1","#fbc2eb"],
    ["#fd7043","#ff8a65"],
    ["#00c6ff","#0072ff"],
    ["#f7971e","#ffd200"],
    ["#a1c4fd","#c2e9fb"],
    ["#43cbff","#9708cc"],
];

interface DataPoint { category: string; value: number; }

export class Visual implements IVisual {
    private host: powerbi.extensibility.visual.IVisualHost;
    private root: HTMLDivElement;
    private tooltip: HTMLDivElement;
    private rafId: number | null = null;

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.root = options.element as HTMLDivElement;
        this.root.style.cssText = "width:100%;height:100%;overflow:hidden;position:relative;";
        this.tooltip = document.createElement("div");
        this.tooltip.style.cssText = `
            position:absolute;pointer-events:none;display:none;z-index:9999;
            background:rgba(15,12,41,0.92);backdrop-filter:blur(12px);
            border:1px solid rgba(255,255,255,0.25);border-radius:10px;
            padding:10px 16px;color:#fff;font-size:13px;font-weight:600;
            box-shadow:0 8px 32px rgba(0,0,0,0.5);white-space:nowrap;
            font-family:'Segoe UI',Arial,sans-serif;
        `;
        this.root.appendChild(this.tooltip);
    }

    public update(options: VisualUpdateOptions): void {
        if (this.rafId !== null) { cancelAnimationFrame(this.rafId); this.rafId = null; }

        const dv: DataView = options.dataViews?.[0];
        const cat  = dv?.categorical?.categories?.[0];
        const vals = dv?.categorical?.values?.[0];

        const W = options.viewport.width  || 600;
        const H = options.viewport.height || 400;

        if (!cat || !vals) {
            this.renderEmpty(W, H, "Drop a Category + Measure field to begin"); return;
        }

        const raw: DataPoint[] = cat.values.map((c, i) => ({
            category: String(c ?? ""),
            value: Number(vals.values[i]) || 0,
        })).filter(d => d.value > 0);

        raw.sort((a, b) => b.value - a.value);
        const data = raw.slice(0, 15);

        if (data.length === 0) {
            this.renderEmpty(W, H, "No positive values to display"); return;
        }

        const measureName  = vals.source?.displayName ?? "Measure";
        const categoryName = cat.source?.displayName  ?? "Category";
        this.renderCombo(data, W, H, measureName, categoryName);
    }

    // =========================================================================
    //  MAIN RENDER
    // =========================================================================
    private renderCombo(
        data: DataPoint[], W: number, H: number,
        measureName: string, categoryName: string,
    ): void {
        const ns = "http://www.w3.org/2000/svg";

        // Clear
        Array.from(this.root.children).forEach(c => { if (c !== this.tooltip) this.root.removeChild(c); });

        const svg = document.createElementNS(ns, "svg") as SVGSVGElement;
        svg.setAttribute("width",  String(W));
        svg.setAttribute("height", String(H));
        svg.style.cssText = "position:absolute;top:0;left:0;overflow:visible;";
        this.root.appendChild(svg);

        // ── defs ─────────────────────────────────────────────────────────────
        const defs = document.createElementNS(ns, "defs");

        // background gradient
        const bgG = document.createElementNS(ns, "linearGradient");
        bgG.setAttribute("id","bg"); bgG.setAttribute("x1","0%"); bgG.setAttribute("y1","0%");
        bgG.setAttribute("x2","100%"); bgG.setAttribute("y2","100%");
        this.stops(bgG, [["0%","#0f0c29"],["55%","#302b63"],["100%","#24243e"]], ns);
        defs.appendChild(bgG);

        // KPI card gradient
        const kpiG = document.createElementNS(ns, "linearGradient");
        kpiG.setAttribute("id","kpiGrad"); kpiG.setAttribute("x1","0%"); kpiG.setAttribute("y1","0%");
        kpiG.setAttribute("x2","0%"); kpiG.setAttribute("y2","100%");
        this.stops(kpiG, [["0%","rgba(255,255,255,0.10)"],["100%","rgba(255,255,255,0.03)"]], ns);
        defs.appendChild(kpiG);

        // bar + donut colour gradients
        PALETTE.forEach(([c1,c2], i) => {
            // horizontal (bars)
            const lg = document.createElementNS(ns, "linearGradient");
            lg.setAttribute("id",`g${i}`); lg.setAttribute("x1","0%"); lg.setAttribute("y1","0%");
            lg.setAttribute("x2","100%"); lg.setAttribute("y2","0%");
            this.stops(lg, [["0%",c1],["100%",c2]], ns);
            defs.appendChild(lg);
        });

        // glow filter
        const flt = document.createElementNS(ns, "filter");
        flt.setAttribute("id","glow");
        const blur = document.createElementNS(ns, "feGaussianBlur");
        blur.setAttribute("in","SourceGraphic"); blur.setAttribute("stdDeviation","2.5"); blur.setAttribute("result","b");
        const merge = document.createElementNS(ns, "feMerge");
        [["b"],["SourceGraphic"]].forEach(([inp]) => {
            const mn = document.createElementNS(ns, "feMergeNode");
            mn.setAttribute("in",inp); merge.appendChild(mn);
        });
        flt.appendChild(blur); flt.appendChild(merge);
        defs.appendChild(flt);

        svg.appendChild(defs);

        // ── background ───────────────────────────────────────────────────────
        const bgRect = document.createElementNS(ns, "rect");
        bgRect.setAttribute("width",String(W)); bgRect.setAttribute("height",String(H));
        bgRect.setAttribute("fill","url(#bg)");
        svg.appendChild(bgRect);

        // ── layout constants ─────────────────────────────────────────────────
        const PAD       = 14;
        const KPI_H     = Math.min(72, H * 0.18);
        const HDR_H     = KPI_H + PAD * 2 + 20;   // title + KPI row height
        const chartY    = HDR_H;
        const chartH    = H - chartY - PAD;
        const splitX    = W * 0.56;                 // bar chart left, donut right
        const barW      = splitX - PAD;
        const donutW    = W - splitX - PAD;

        // ── TITLE ─────────────────────────────────────────────────────────────
        const title = this.text(ns, `${categoryName}  ×  ${measureName}`,
            W/2, 18, "#fff", 16, "700", "middle");
        title.setAttribute("letter-spacing","0.5");
        svg.appendChild(title);

        const sub = this.text(ns, "Combo Insight Panel · Jeel Boghra · EMPN2198",
            W/2, 32, "rgba(255,255,255,0.4)", 10, "400", "middle");
        svg.appendChild(sub);

        // divider under title
        svg.appendChild(this.line(ns, PAD, 38, W-PAD, 38, "rgba(255,255,255,0.12)"));

        // ── KPI CARDS ─────────────────────────────────────────────────────────
        const values = data.map(d => d.value);
        const total  = values.reduce((s,v) => s+v, 0);
        const avg    = total / values.length;
        const maxV   = Math.max(...values);
        const minV   = Math.min(...values);

        const kpis = [
            { label:"TOTAL",   value: this.fmt(total), color:"#43e97b", icon:"∑" },
            { label:"AVERAGE", value: this.fmt(avg),   color:"#4facfe", icon:"μ" },
            { label:"HIGHEST", value: this.fmt(maxV),  color:"#f953c6", icon:"▲" },
            { label:"LOWEST",  value: this.fmt(minV),  color:"#fa709a", icon:"▼" },
        ];

        const kpiY  = 44;
        const kpiGap = 6;
        const kpiCardW = (W - PAD*2 - kpiGap*3) / 4;

        kpis.forEach((k, i) => {
            const cx = PAD + i*(kpiCardW + kpiGap);
            const cy = kpiY;

            // card bg
            const card = document.createElementNS(ns, "rect");
            card.setAttribute("x",String(cx)); card.setAttribute("y",String(cy));
            card.setAttribute("width",String(kpiCardW)); card.setAttribute("height",String(KPI_H));
            card.setAttribute("fill","url(#kpiGrad)");
            card.setAttribute("rx","10"); card.setAttribute("stroke","rgba(255,255,255,0.12)");
            card.setAttribute("stroke-width","1");
            svg.appendChild(card);

            // left accent bar
            const accent = document.createElementNS(ns, "rect");
            accent.setAttribute("x",String(cx+1)); accent.setAttribute("y",String(cy+1));
            accent.setAttribute("width","3"); accent.setAttribute("height",String(KPI_H-2));
            accent.setAttribute("fill",k.color); accent.setAttribute("rx","2");
            svg.appendChild(accent);

            // icon
            svg.appendChild(this.text(ns, k.icon, cx+14, cy+KPI_H*0.38, k.color,
                Math.min(16, KPI_H*0.3), "700", "middle"));

            // value
            const vSize = Math.min(16, KPI_H*0.28);
            svg.appendChild(this.text(ns, k.value, cx + kpiCardW/2 + 6, cy + KPI_H*0.56,
                "#ffffff", vSize, "800", "middle"));

            // label
            svg.appendChild(this.text(ns, k.label, cx + kpiCardW/2 + 6, cy + KPI_H*0.82,
                "rgba(255,255,255,0.45)", Math.min(9, KPI_H*0.14), "600", "middle"));
        });

        // divider between KPI and charts
        svg.appendChild(this.line(ns, PAD, chartY-2, W-PAD, chartY-2, "rgba(255,255,255,0.1)"));

        // ── vertical divider between bar and donut ────────────────────────────
        svg.appendChild(this.line(ns, splitX, chartY+4, splitX, H-PAD, "rgba(255,255,255,0.1)"));

        // ── BAR CHART (left) ──────────────────────────────────────────────────
        svg.appendChild(this.text(ns, "📊 Top Performers", PAD+4, chartY+14,
            "rgba(255,255,255,0.65)", 11, "600"));

        const barData = data.slice(0, 10);
        const maxBar  = barData[0].value;
        const barsY   = chartY + 22;
        const barsH   = H - barsY - PAD;
        const rowH    = barsH / barData.length;
        const barH2   = Math.max(6, Math.min(rowH*0.52, 26));
        const LBLW    = Math.min(90, barW * 0.28);
        const VALW    = 58;
        const trackW  = barW - LBLW - VALW - PAD;

        const barRects: { el: SVGRectElement; target: number }[] = [];

        barData.forEach((d, i) => {
            const ry  = barsY + i*rowH + (rowH - barH2)/2;
            const gi  = i % PALETTE.length;
            const [c1] = PALETTE[gi];

            // hover row
            const rowBg = document.createElementNS(ns, "rect");
            rowBg.setAttribute("x",String(PAD)); rowBg.setAttribute("y",String(barsY + i*rowH));
            rowBg.setAttribute("width",String(barW)); rowBg.setAttribute("height",String(rowH));
            rowBg.setAttribute("fill","rgba(255,255,255,0)"); rowBg.setAttribute("rx","4");
            rowBg.style.cursor = "pointer";
            rowBg.addEventListener("mouseenter", () => rowBg.setAttribute("fill","rgba(255,255,255,0.05)"));
            rowBg.addEventListener("mouseleave", () => { rowBg.setAttribute("fill","rgba(255,255,255,0)"); this.hideTooltip(); });
            rowBg.addEventListener("mousemove", (e: MouseEvent) => {
                const r = this.root.getBoundingClientRect();
                this.showTooltip(e.clientX-r.left+12, e.clientY-r.top-38,
                    `<span style="color:${c1}">■</span> <b>${d.category}</b><br>${measureName}: <b>${this.fmt(d.value)}</b>`);
            });
            svg.appendChild(rowBg);

            // rank badge
            const badgeR = document.createElementNS(ns, "rect");
            badgeR.setAttribute("x",String(PAD+2)); badgeR.setAttribute("y",String(ry + barH2/2 - 8));
            badgeR.setAttribute("width","16"); badgeR.setAttribute("height","14");
            badgeR.setAttribute("fill",`url(#g${gi})`); badgeR.setAttribute("rx","3");
            svg.appendChild(badgeR);
            svg.appendChild(this.text(ns, String(i+1), PAD+10, ry+barH2/2+4, "#fff", 8, "700", "middle"));

            // label
            const lbl = this.text(ns, d.category.length>12 ? d.category.slice(0,11)+"…" : d.category,
                PAD+22+LBLW-4, ry+barH2/2+4, "rgba(255,255,255,0.80)",
                Math.max(8, Math.min(11, barH2*0.75)), "500", "end");
            svg.appendChild(lbl);

            // track
            const trk = document.createElementNS(ns, "rect");
            trk.setAttribute("x",String(PAD+LBLW+22)); trk.setAttribute("y",String(ry));
            trk.setAttribute("width",String(trackW)); trk.setAttribute("height",String(barH2));
            trk.setAttribute("fill","rgba(255,255,255,0.07)"); trk.setAttribute("rx",String(barH2/2));
            svg.appendChild(trk);

            // bar
            const bar = document.createElementNS(ns, "rect");
            bar.setAttribute("x",String(PAD+LBLW+22)); bar.setAttribute("y",String(ry));
            bar.setAttribute("width","0"); bar.setAttribute("height",String(barH2));
            bar.setAttribute("fill",`url(#g${gi})`); bar.setAttribute("rx",String(barH2/2));
            bar.setAttribute("filter","url(#glow)");
            svg.appendChild(bar);
            barRects.push({ el: bar, target: (d.value/maxBar)*trackW });

            // value
            svg.appendChild(this.text(ns, this.fmt(d.value),
                PAD+LBLW+22+trackW+4, ry+barH2/2+4,
                c1, Math.max(8, Math.min(11, barH2*0.75)), "700"));
        });

        // ── DONUT CHART (right) ───────────────────────────────────────────────
        svg.appendChild(this.text(ns, "🍩 Distribution", splitX+8, chartY+14,
            "rgba(255,255,255,0.65)", 11, "600"));

        const donutData = data.slice(0, 8);
        const donutTotal = donutData.reduce((s,d) => s+d.value, 0);
        const cx2 = splitX + donutW/2;
        const cy2 = chartY + 22 + (H - (chartY+22) - PAD) * 0.44;
        const outerR = Math.min(donutW, H - chartY - PAD) * 0.30;
        const innerR = outerR * 0.55;

        let startAngle = -Math.PI/2;
        const arcEls: { el: SVGPathElement; centerX: number; centerY: number;
                         d: DataPoint; pct: number; color: string }[] = [];

        donutData.forEach((d, i) => {
            const pct  = d.value / donutTotal;
            const span = pct * Math.PI * 2;
            const end  = startAngle + span;
            const mid  = startAngle + span/2;
            const [c1] = PALETTE[i % PALETTE.length];

            const path = document.createElementNS(ns, "path");
            path.setAttribute("fill",`url(#g${i % PALETTE.length})`);
            path.setAttribute("stroke","rgba(15,12,41,0.8)"); path.setAttribute("stroke-width","2");
            path.setAttribute("filter","url(#glow)");
            path.setAttribute("d", this.arcPath(cx2, cy2, innerR, outerR, startAngle, end));
            path.style.cursor = "pointer";
            path.style.transition = "transform 0.15s";
            path.style.transformOrigin = `${cx2}px ${cy2}px`;

            const lmx = cx2 + Math.cos(mid)*(outerR+1);
            const lmy = cy2 + Math.sin(mid)*(outerR+1);

            path.addEventListener("mouseenter", () => {
                path.style.transform = "scale(1.04)";
            });
            path.addEventListener("mouseleave", () => {
                path.style.transform = "scale(1)";
                this.hideTooltip();
            });
            path.addEventListener("mousemove", (e: MouseEvent) => {
                const r = this.root.getBoundingClientRect();
                this.showTooltip(e.clientX-r.left+12, e.clientY-r.top-40,
                    `<span style="color:${c1}">■</span> <b>${d.category}</b><br>` +
                    `${measureName}: <b>${this.fmt(d.value)}</b>  (${(pct*100).toFixed(1)}%)`);
            });
            svg.appendChild(path);
            arcEls.push({ el: path, centerX: lmx, centerY: lmy, d, pct, color: c1 });
            startAngle = end;
        });

        // donut center
        const cCircle = document.createElementNS(ns, "circle");
        cCircle.setAttribute("cx",String(cx2)); cCircle.setAttribute("cy",String(cy2));
        cCircle.setAttribute("r",String(innerR-2)); cCircle.setAttribute("fill","rgba(15,12,41,0.85)");
        svg.appendChild(cCircle);
        svg.appendChild(this.text(ns, "TOTAL", cx2, cy2-10, "rgba(255,255,255,0.45)", 9, "600", "middle"));
        svg.appendChild(this.text(ns, this.fmt(total), cx2, cy2+6, "#fff", Math.min(14, innerR*0.35), "800", "middle"));
        svg.appendChild(this.text(ns, `${data.length} items`, cx2, cy2+19, "rgba(255,255,255,0.4)", 9, "400", "middle"));

        // ── DONUT LEGEND ──────────────────────────────────────────────────────
        const legendY = cy2 + outerR + 10;
        const legCols  = 2;
        const legW     = donutW / legCols;
        donutData.forEach((d, i) => {
            const col = i % legCols;
            const row = Math.floor(i / legCols);
            const lx  = splitX + 8 + col * legW;
            const ly  = legendY + row * 16;
            const [c1] = PALETTE[i % PALETTE.length];

            const dot = document.createElementNS(ns, "circle");
            dot.setAttribute("cx",String(lx+5)); dot.setAttribute("cy",String(ly));
            dot.setAttribute("r","4"); dot.setAttribute("fill",c1);
            svg.appendChild(dot);

            const maxLeg = Math.floor(legW/6.5) - 2;
            const label  = d.category.length > maxLeg ? d.category.slice(0,maxLeg-1)+"…" : d.category;
            svg.appendChild(this.text(ns, label, lx+13, ly+4,
                "rgba(255,255,255,0.7)", 9, "500"));
        });

        // ── animate bars ──────────────────────────────────────────────────────
        const t0 = performance.now();
        const DURATION = 900;
        const tick = (now: number) => {
            const p = Math.min((now - t0) / DURATION, 1);
            const e = 1 - Math.pow(1-p, 3);
            barRects.forEach(({ el, target }) => el.setAttribute("width", String(e * target)));
            if (p < 1) this.rafId = requestAnimationFrame(tick);
            else        this.rafId = null;
        };
        this.rafId = requestAnimationFrame(tick);
    }

    // =========================================================================
    //  HELPERS
    // =========================================================================
    private arcPath(cx:number,cy:number,ir:number,or:number,a0:number,a1:number): string {
        const x1=cx+Math.cos(a0)*or, y1=cy+Math.sin(a0)*or;
        const x2=cx+Math.cos(a1)*or, y2=cy+Math.sin(a1)*or;
        const x3=cx+Math.cos(a1)*ir, y3=cy+Math.sin(a1)*ir;
        const x4=cx+Math.cos(a0)*ir, y4=cy+Math.sin(a0)*ir;
        const large = (a1-a0) > Math.PI ? 1 : 0;
        return `M${x1},${y1} A${or},${or},0,${large},1,${x2},${y2} `+
               `L${x3},${y3} A${ir},${ir},0,${large},0,${x4},${y4} Z`;
    }

    private stops(el:SVGElement, s:[string,string][], ns:string): void {
        s.forEach(([off,col])=>{ const st=document.createElementNS(ns,"stop");
            st.setAttribute("offset",off); st.setAttribute("stop-color",col); el.appendChild(st); });
    }

    private text(ns:string,txt:string,x:number,y:number,fill:string,size:number,
                 weight:string="400",anchor:string="start"): SVGTextElement {
        const el=document.createElementNS(ns,"text") as SVGTextElement;
        el.setAttribute("x",String(x)); el.setAttribute("y",String(y));
        el.setAttribute("fill",fill); el.setAttribute("font-size",String(size));
        el.setAttribute("font-weight",weight); el.setAttribute("text-anchor",anchor);
        el.setAttribute("font-family","'Segoe UI',Arial,sans-serif");
        el.textContent=txt; return el;
    }

    private line(ns:string,x1:number,y1:number,x2:number,y2:number,stroke:string): SVGLineElement {
        const el=document.createElementNS(ns,"line") as SVGLineElement;
        el.setAttribute("x1",String(x1)); el.setAttribute("y1",String(y1));
        el.setAttribute("x2",String(x2)); el.setAttribute("y2",String(y2));
        el.setAttribute("stroke",stroke); el.setAttribute("stroke-width","1"); return el;
    }

    private fmt(v:number): string {
        if(v>=1_000_000) return (v/1_000_000).toFixed(2)+"M";
        if(v>=1_000)     return (v/1_000).toFixed(1)+"K";
        return v.toLocaleString(undefined,{maximumFractionDigits:1});
    }

    private showTooltip(x:number,y:number,html:string): void {
        this.tooltip.style.left=x+"px"; this.tooltip.style.top=y+"px";
        this.tooltip.innerHTML=html; this.tooltip.style.display="block";
    }
    private hideTooltip(): void { this.tooltip.style.display="none"; }

    private renderEmpty(W:number,H:number,msg:string): void {
        if(this.rafId!==null){cancelAnimationFrame(this.rafId);this.rafId=null;}
        Array.from(this.root.children).forEach(c=>{ if(c!==this.tooltip) this.root.removeChild(c); });

        const ns="http://www.w3.org/2000/svg";
        const svg=document.createElementNS(ns,"svg") as SVGSVGElement;
        svg.setAttribute("width",String(W)); svg.setAttribute("height",String(H));
        svg.style.cssText="position:absolute;top:0;left:0;";
        this.root.appendChild(svg);

        const bg=document.createElementNS(ns,"rect");
        bg.setAttribute("width",String(W)); bg.setAttribute("height",String(H));
        bg.setAttribute("fill","#1a1a2e"); svg.appendChild(bg);

        const ic=document.createElementNS(ns,"text");
        ic.setAttribute("x",String(W/2)); ic.setAttribute("y",String(H/2-20));
        ic.setAttribute("text-anchor","middle"); ic.setAttribute("font-size","36");
        ic.textContent="📊🍩"; svg.appendChild(ic);

        svg.appendChild(this.text(ns,msg,W/2,H/2+18,"rgba(255,255,255,0.5)",13,"400","middle"));
        svg.appendChild(this.text(ns,"Combo Insight Panel · Jeel Boghra · EMPN2198",
            W/2,H/2+36,"rgba(255,255,255,0.25)",10,"400","middle"));
    }

    public destroy(): void {
        if(this.rafId!==null) cancelAnimationFrame(this.rafId);
    }
}