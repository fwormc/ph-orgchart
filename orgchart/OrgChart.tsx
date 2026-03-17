import * as React from 'react';
import { jsPDF } from 'jspdf';

// ─── Public types (used by index.ts) ─────────────────────────────────────────

export interface Entity {
    entity_id: string;
    entity_name: string;
}

export interface Shareholding {
    child: string;
    parent: string;
    /** Ownership fraction between 0 and 1. */
    share: number;
}

export interface IOrgChartProps {
    entitiesJson: string;
    shareholdingsJson: string;
    width: number;
    height: number;
}

// ─── Layout constants ─────────────────────────────────────────────────────────

const CARD_W = 200;
const CARD_H = 88;
const H_GAP = 64;
const V_GAP = 96;
const GRID_SIZE = 28;
const CARD_RADIUS = 10;
const ACCENT_H = 8;

// Power Platform indigo palette
const ACCENT_COLOR = '#5B5FC7';
const CARD_BG = '#FFFFFF';
const GRID_BG = '#F5F5FA';
const GRID_LINE = '#DDDDE8';
const TEXT_PRIMARY = '#11100F';
const TEXT_SECONDARY = '#8A8886';

const MIN_ZOOM = 0.15;
const MAX_ZOOM = 4;

// ─── Utilities ────────────────────────────────────────────────────────────────

function safeParseJson<T>(json: string): T[] {
    try {
        const parsed: unknown = JSON.parse(json || '[]');
        return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
        return [];
    }
}

function truncate(text: string, max: number): string {
    return text.length > max ? text.slice(0, max - 1) + '\u2026' : text;
}

function escapeXml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Path string for a rectangle whose top-left and top-right corners are
 * rounded with radius `r` and whose bottom edge is straight.
 */
function topRoundedRectPath(w: number, h: number, r: number): string {
    return `M 0 ${r} Q 0 0 ${r} 0 L ${w - r} 0 Q ${w} 0 ${w} ${r} L ${w} ${h} L 0 ${h} Z`;
}

// ─── Layout algorithm ─────────────────────────────────────────────────────────

interface NodePos { x: number; y: number; }

/**
 * Hierarchical (Sugiyama-inspired) layout for a directed acyclic graph.
 *
 * Steps:
 *  1. Assign each node to the deepest layer reachable from any root (longest
 *     path layering). This ensures children always sit below their parents.
 *  2. Sort nodes within each layer by the barycentric average x-position of
 *     their parents, reducing edge crossings.
 *  3. Centre each layer horizontally.
 */
function computeLayout(entities: Entity[], shareholdings: Shareholding[]): Map<string, NodePos> {
    if (entities.length === 0) return new Map();

    const ids = new Set(entities.map(e => e.entity_id));
    const childrenOf = new Map<string, string[]>();
    const parentsOf = new Map<string, string[]>();

    for (const id of ids) {
        childrenOf.set(id, []);
        parentsOf.set(id, []);
    }

    for (const s of shareholdings) {
        if (ids.has(s.parent) && ids.has(s.child)) {
            childrenOf.get(s.parent)!.push(s.child);
            parentsOf.get(s.child)!.push(s.parent);
        }
    }

    // Assign layer = longest path from any root (BFS, keep maximum depth)
    const layer = new Map<string, number>();
    const roots = [...ids].filter(id => parentsOf.get(id)!.length === 0);
    const startNodes = roots.length > 0 ? roots : [entities[0].entity_id];
    const queue: { id: string; d: number }[] = startNodes.map(id => ({ id, d: 0 }));

    while (queue.length > 0) {
        const { id, d } = queue.shift()!;
        if (!layer.has(id) || layer.get(id)! < d) {
            layer.set(id, d);
            for (const child of childrenOf.get(id)!) queue.push({ id: child, d: d + 1 });
        }
    }

    // Isolated nodes (no edges) fall to layer 0
    for (const id of ids) if (!layer.has(id)) layer.set(id, 0);

    const maxL = Math.max(...layer.values());
    const layerGroups: string[][] = Array.from({ length: maxL + 1 }, () => []);
    for (const [id, l] of layer) layerGroups[l].push(id);

    // Barycentric sort: sort each layer by average x of parents.
    // We build tempX (centre-x of each node) top-down so that later layers
    // can reference the already-computed positions of earlier layers.
    const tempX = new Map<string, number>();

    for (let l = 0; l <= maxL; l++) {
        const group = layerGroups[l];

        if (l === 0) {
            group.sort(); // alphabetical for stability at the root layer
        } else {
            group.sort((a, b) => {
                const avg = (id: string): number => {
                    const ps = parentsOf.get(id)!;
                    if (ps.length === 0) return 0;
                    return ps.reduce((s, p) => s + (tempX.get(p) ?? 0), 0) / ps.length;
                };
                return avg(a) - avg(b);
            });
        }

        const totalW = group.length * CARD_W + Math.max(0, group.length - 1) * H_GAP;
        const startX = -totalW / 2;
        group.forEach((id, i) => {
            tempX.set(id, startX + i * (CARD_W + H_GAP) + CARD_W / 2); // store centre
        });
    }

    // Build final top-left positions
    const positions = new Map<string, NodePos>();
    for (let l = 0; l <= maxL; l++) {
        const group = layerGroups[l];
        const totalW = group.length * CARD_W + Math.max(0, group.length - 1) * H_GAP;
        const startX = -totalW / 2;
        group.forEach((id, i) => {
            positions.set(id, {
                x: startX + i * (CARD_W + H_GAP),
                y: l * (CARD_H + V_GAP),
            });
        });
    }

    return positions;
}

// ─── PDF export helpers ───────────────────────────────────────────────────────

function buildExportSvg(
    entities: Entity[],
    shareholdings: Shareholding[],
    positions: Map<string, NodePos>
): { svgString: string; svgWidth: number; svgHeight: number } {
    if (positions.size === 0) return { svgString: '', svgWidth: 0, svgHeight: 0 };

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of positions.values()) {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x + CARD_W);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y + CARD_H);
    }

    const PAD = 56;
    minX -= PAD; minY -= PAD; maxX += PAD; maxY += PAD;
    const svgW = maxX - minX;
    const svgH = maxY - minY;
    // align grid to viewBox origin
    const gox = ((((-minX) % GRID_SIZE) + GRID_SIZE) % GRID_SIZE);
    const goy = ((((-minY) % GRID_SIZE) + GRID_SIZE) % GRID_SIZE);

    const edgeSvg = shareholdings.map(s => {
        const pp = positions.get(s.parent);
        const cp = positions.get(s.child);
        if (!pp || !cp) return '';
        const x1 = pp.x + CARD_W / 2;
        const y1 = pp.y + CARD_H;
        const x2 = cp.x + CARD_W / 2;
        const y2 = cp.y;
        const midY = (y1 + y2) / 2;
        const d = `M ${x1} ${y1} C ${x1} ${midY},${x2} ${midY},${x2} ${y2}`;
        const pct = `${(s.share * 100).toFixed(1)}%`;
        const lx = (x1 + x2) / 2;
        const ly = midY;
        const pillW = 44, pillH = 18;
        return [
            `<g>`,
            `<path d="${d}" fill="none" stroke="${ACCENT_COLOR}" stroke-width="1.5" marker-end="url(#oc-exp-arrow)" opacity="0.8"/>`,
            `<rect x="${lx - pillW / 2}" y="${ly - pillH / 2}" width="${pillW}" height="${pillH}" rx="${pillH / 2}" fill="${CARD_BG}" stroke="${ACCENT_COLOR}" stroke-width="1"/>`,
            `<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle" font-size="9.5" font-weight="600" fill="${ACCENT_COLOR}" font-family="Segoe UI,system-ui,sans-serif">${pct}</text>`,
            `</g>`,
        ].join('');
    }).join('\n');

    const cardSvg = entities.map(e => {
        const pos = positions.get(e.entity_id);
        if (!pos) return '';
        const name = escapeXml(truncate(e.entity_name, 22));
        const eid  = escapeXml(truncate(e.entity_id, 28));
        const ap = topRoundedRectPath(CARD_W, ACCENT_H, CARD_RADIUS);
        return [
            `<g transform="translate(${pos.x},${pos.y})">`,
            `<rect x="2" y="4" width="${CARD_W}" height="${CARD_H}" rx="${CARD_RADIUS}" fill="rgba(0,0,0,0.07)"/>`,
            `<rect width="${CARD_W}" height="${CARD_H}" rx="${CARD_RADIUS}" fill="${CARD_BG}" stroke="${ACCENT_COLOR}" stroke-width="1.5"/>`,
            `<path d="${ap}" fill="${ACCENT_COLOR}"/>`,
            `<text x="${CARD_W / 2}" y="${ACCENT_H + 24}" text-anchor="middle" dominant-baseline="middle" font-size="13" font-weight="700" fill="${TEXT_PRIMARY}" font-family="Segoe UI,system-ui,sans-serif">${name}</text>`,
            `<line x1="16" x2="${CARD_W - 16}" y1="${ACCENT_H + 38}" y2="${ACCENT_H + 38}" stroke="#EBEBF0" stroke-width="1"/>`,
            `<text x="${CARD_W / 2}" y="${ACCENT_H + 54}" text-anchor="middle" dominant-baseline="middle" font-size="10" fill="${TEXT_SECONDARY}" font-family="Segoe UI,system-ui,sans-serif">${eid}</text>`,
            `</g>`,
        ].join('');
    }).join('\n');

    const svgString = [
        `<?xml version="1.0" encoding="UTF-8"?>`,
        `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="${minX} ${minY} ${svgW} ${svgH}">`,
        `  <defs>`,
        `    <pattern id="oc-exp-grid" width="${GRID_SIZE}" height="${GRID_SIZE}" patternUnits="userSpaceOnUse" patternTransform="translate(${gox},${goy})">`,
        `      <path d="M ${GRID_SIZE} 0 L 0 0 0 ${GRID_SIZE}" fill="none" stroke="${GRID_LINE}" stroke-width="0.6"/>`,
        `    </pattern>`,
        `    <marker id="oc-exp-arrow" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">`,
        `      <polygon points="0 0,10 3.5,0 7" fill="${ACCENT_COLOR}" opacity="0.85"/>`,
        `    </marker>`,
        `  </defs>`,
        `  <rect x="${minX}" y="${minY}" width="${svgW}" height="${svgH}" fill="${GRID_BG}"/>`,
        `  <rect x="${minX}" y="${minY}" width="${svgW}" height="${svgH}" fill="url(#oc-exp-grid)"/>`,
        edgeSvg,
        cardSvg,
        `</svg>`,
    ].join('\n');

    return { svgString, svgWidth: svgW, svgHeight: svgH };
}

function svgToDataUrl(svgString: string, pxW: number, pxH: number): Promise<string> {
    return new Promise((resolve, reject) => {
        const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = pxW;
            canvas.height = pxH;
            const ctx = canvas.getContext('2d');
            if (!ctx) { URL.revokeObjectURL(url); reject(new Error('No 2D context')); return; }
            ctx.fillStyle = GRID_BG;
            ctx.fillRect(0, 0, pxW, pxH);
            ctx.drawImage(img, 0, 0, pxW, pxH);
            URL.revokeObjectURL(url);
            resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('SVG render failed')); };
        img.src = url;
    });
}

// ─── Entity card ──────────────────────────────────────────────────────────────

interface EntityCardProps {
    entity: Entity;
    pos: NodePos;
}

const EntityCard: React.FC<EntityCardProps> = ({ entity, pos }) => (
    <g transform={`translate(${pos.x},${pos.y})`}>
        {/* Soft drop-shadow (simulated with an offset grey rect) */}
        <rect
            x={2} y={4}
            width={CARD_W} height={CARD_H}
            rx={CARD_RADIUS}
            fill="rgba(0,0,0,0.07)"
        />

        {/* Card body */}
        <rect
            width={CARD_W} height={CARD_H}
            rx={CARD_RADIUS}
            fill={CARD_BG}
            stroke={ACCENT_COLOR}
            strokeWidth={1.5}
        />

        {/* Colour accent strip (top corners rounded, bottom straight) */}
        <path
            d={topRoundedRectPath(CARD_W, ACCENT_H, CARD_RADIUS)}
            fill={ACCENT_COLOR}
        />

        {/* Entity name */}
        <text
            x={CARD_W / 2}
            y={ACCENT_H + 24}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={13}
            fontWeight="700"
            fill={TEXT_PRIMARY}
            fontFamily="'Segoe UI',system-ui,sans-serif"
        >
            {truncate(entity.entity_name, 22)}
        </text>

        {/* Separator line */}
        <line
            x1={16} x2={CARD_W - 16}
            y1={ACCENT_H + 38} y2={ACCENT_H + 38}
            stroke="#EBEBF0" strokeWidth={1}
        />

        {/* Entity ID (secondary, smaller) */}
        <text
            x={CARD_W / 2}
            y={ACCENT_H + 54}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={10}
            fill={TEXT_SECONDARY}
            fontFamily="'Segoe UI',system-ui,sans-serif"
        >
            {truncate(entity.entity_id, 28)}
        </text>
    </g>
);

// ─── Connection (edge) ────────────────────────────────────────────────────────

interface ConnectionProps {
    shareholding: Shareholding;
    parentPos: NodePos;
    childPos: NodePos;
}

const Connection: React.FC<ConnectionProps> = ({ shareholding, parentPos, childPos }) => {
    const x1 = parentPos.x + CARD_W / 2;
    const y1 = parentPos.y + CARD_H;
    const x2 = childPos.x + CARD_W / 2;
    const y2 = childPos.y;
    const midY = (y1 + y2) / 2;

    // Cubic bezier: leave parent bottom vertically, arrive at child top vertically
    const d = `M ${x1} ${y1} C ${x1} ${midY},${x2} ${midY},${x2} ${y2}`;

    const pct = `${(shareholding.share * 100).toFixed(1)}%`;
    const lx = (x1 + x2) / 2;
    const ly = midY;
    const pillW = 44;
    const pillH = 18;

    return (
        <g>
            <path
                d={d}
                fill="none"
                stroke={ACCENT_COLOR}
                strokeWidth={1.5}
                markerEnd="url(#oc-arrow)"
                opacity={0.8}
            />
            {/* Ownership percentage pill */}
            <rect
                x={lx - pillW / 2} y={ly - pillH / 2}
                width={pillW} height={pillH}
                rx={pillH / 2}
                fill={CARD_BG}
                stroke={ACCENT_COLOR}
                strokeWidth={1}
            />
            <text
                x={lx} y={ly}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={9.5}
                fontWeight="600"
                fill={ACCENT_COLOR}
                fontFamily="'Segoe UI',system-ui,sans-serif"
            >
                {pct}
            </text>
        </g>
    );
};

// ─── OrgChart (root component) ────────────────────────────────────────────────

export const OrgChart: React.FC<IOrgChartProps> = ({
    entitiesJson,
    shareholdingsJson,
    width,
    height,
}) => {
    const entities = React.useMemo(() => safeParseJson<Entity>(entitiesJson), [entitiesJson]);
    const shareholdings = React.useMemo(() => safeParseJson<Shareholding>(shareholdingsJson), [shareholdingsJson]);
    const positions = React.useMemo(() => computeLayout(entities, shareholdings), [entities, shareholdings]);

    // Pan & zoom state
    const [transform, setTransform] = React.useState({ x: 0, y: 0, scale: 1 });
    const dragging = React.useRef(false);
    const lastPt = React.useRef({ x: 0, y: 0 });
    const svgRef = React.useRef<SVGSVGElement>(null);
    const initialized = React.useRef(false);

    const w = width > 0 ? width : 600;
    const h = height > 0 ? height : 400;

    // Auto-fit the chart to fill the viewport the first time data arrives.
    React.useEffect(() => {
        if (initialized.current || positions.size === 0 || w <= 0 || h <= 0) return;
        initialized.current = true;

        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const p of positions.values()) {
            minX = Math.min(minX, p.x);
            maxX = Math.max(maxX, p.x + CARD_W);
            minY = Math.min(minY, p.y);
            maxY = Math.max(maxY, p.y + CARD_H);
        }

        const padding = 48;
        const chartW = maxX - minX;
        const chartH = maxY - minY;
        const scale = Math.min(1, Math.min((w - 2 * padding) / chartW, (h - 2 * padding) / chartH));

        // Centre of the chart in chart-space
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;

        setTransform({ x: -cx * scale, y: -cy * scale, scale });
    }, [positions, w, h]);

    // Non-passive wheel listener so we can call preventDefault() and prevent
    // the page from scrolling while the user zooms the chart.
    React.useEffect(() => {
        const el = svgRef.current;
        if (!el) return;
        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
            setTransform(t => ({
                ...t,
                scale: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, t.scale * factor)),
            }));
        };
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
    }, []);

    const onMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
        if (e.button !== 0) return;
        dragging.current = true;
        lastPt.current = { x: e.clientX, y: e.clientY };
        e.preventDefault();
    };

    const onMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
        if (!dragging.current) return;
        const dx = e.clientX - lastPt.current.x;
        const dy = e.clientY - lastPt.current.y;
        lastPt.current = { x: e.clientX, y: e.clientY };
        setTransform(t => ({ ...t, x: t.x + dx, y: t.y + dy }));
    };

    const stopDrag = () => { dragging.current = false; };

    const isEmpty = entities.length === 0;

    const [exporting, setExporting] = React.useState(false);

    const handleExport = React.useCallback(() => {
        if (exporting || positions.size === 0) return;
        setExporting(true);
        const SCALE = 3;
        const { svgString, svgWidth, svgHeight } = buildExportSvg(entities, shareholdings, positions);
        if (!svgString) { setExporting(false); return; }
        svgToDataUrl(svgString, svgWidth * SCALE, svgHeight * SCALE)
            .then(dataUrl => {
                const MM_PER_PX = 25.4 / 96;
                const pdfW = svgWidth * MM_PER_PX;
                const pdfH = svgHeight * MM_PER_PX;
                const pdf = new jsPDF({
                    orientation: svgWidth >= svgHeight ? 'l' : 'p',
                    unit: 'mm',
                    format: [pdfW, pdfH],
                });
                pdf.addImage(dataUrl, 'PNG', 0, 0, pdfW, pdfH);
                pdf.save('orgchart.pdf');
                setExporting(false);
                return undefined;
            })
            .catch(() => { setExporting(false); });
    }, [exporting, positions, entities, shareholdings]);

    return (
        <div style={{ position: 'relative', width: w, height: h }}>
        <svg
            ref={svgRef}
            width={w}
            height={h}
            style={{ display: 'block', cursor: 'grab', userSelect: 'none', touchAction: 'none' }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={stopDrag}
            onMouseLeave={stopDrag}
        >
            <defs>
                {/* Dot-corner grid pattern */}
                <pattern
                    id="oc-grid"
                    width={GRID_SIZE}
                    height={GRID_SIZE}
                    patternUnits="userSpaceOnUse"
                >
                    <path
                        d={`M ${GRID_SIZE} 0 L 0 0 0 ${GRID_SIZE}`}
                        fill="none"
                        stroke={GRID_LINE}
                        strokeWidth={0.6}
                    />
                </pattern>

                {/* Arrowhead marker for shareholding edges */}
                <marker
                    id="oc-arrow"
                    markerWidth="10"
                    markerHeight="7"
                    refX="9"
                    refY="3.5"
                    orient="auto"
                >
                    <polygon points="0 0,10 3.5,0 7" fill={ACCENT_COLOR} opacity="0.85" />
                </marker>
            </defs>

            {/* ── Background ───────────────────────────────────────────────── */}
            <rect width={w} height={h} fill={GRID_BG} />
            <rect width={w} height={h} fill="url(#oc-grid)" />

            {/* ── Chart canvas (pan + zoom group) ──────────────────────────── */}
            <g transform={`translate(${w / 2 + transform.x},${h / 2 + transform.y}) scale(${transform.scale})`}>
                {isEmpty ? (
                    <text
                        x={0} y={0}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontSize={14}
                        fill={TEXT_SECONDARY}
                        fontFamily="'Segoe UI',sans-serif"
                    >
                        No data — provide entities and shareholdings
                    </text>
                ) : (
                    <>
                        {/* Edges drawn first so cards render on top */}
                        {shareholdings.map((s, i) => {
                            const pp = positions.get(s.parent);
                            const cp = positions.get(s.child);
                            return (pp && cp)
                                ? <Connection key={i} shareholding={s} parentPos={pp} childPos={cp} />
                                : null;
                        })}

                        {/* Entity cards */}
                        {entities.map(e => {
                            const pos = positions.get(e.entity_id);
                            return pos
                                ? <EntityCard key={e.entity_id} entity={e} pos={pos} />
                                : null;
                        })}
                    </>
                )}
            </g>
        </svg>
        <button
            onClick={handleExport}
            disabled={exporting || isEmpty}
            style={{
                position: 'absolute',
                top: 12,
                right: 12,
                background: exporting ? '#8E90D0' : ACCENT_COLOR,
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                padding: '7px 16px',
                fontSize: 13,
                fontWeight: 600,
                fontFamily: "'Segoe UI', system-ui, sans-serif",
                cursor: exporting || isEmpty ? 'default' : 'pointer',
                boxShadow: '0 2px 8px rgba(91,95,199,0.30)',
                letterSpacing: '0.02em',
                zIndex: 10,
                opacity: isEmpty ? 0.5 : 1,
                transition: 'background 0.15s',
            }}
        >
            {exporting ? 'Exporting\u2026' : '\u2193 Export PDF'}
        </button>
        </div>
    );
};
