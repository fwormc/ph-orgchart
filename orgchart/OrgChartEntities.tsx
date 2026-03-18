import * as React from 'react';

// ─── Shared types ─────────────────────────────────────────────────────────────

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

export interface NodePos { x: number; y: number; }

// ─── Layout constants ─────────────────────────────────────────────────────────

export const CARD_W = 200;
export const CARD_H = 88;
export const H_GAP = 64;
export const V_GAP = 96;
export const GRID_SIZE = 28;
export const CARD_RADIUS = 10;
export const ACCENT_H = 8;

// HARTMANN brand color palette (https://design.hartmann.info/en/design-basics/color)
export const ACCENT_COLOR = '#0045FF'; // HARTMANN Bright Blue
export const CARD_BG = '#FFFFFF';
export const GRID_BG = '#F0F4FF';     // Bright Blue tint background
export const GRID_LINE = '#CBD6FF';   // Bright Blue tint grid lines
export const TEXT_PRIMARY = '#2F2F2F'; // HARTMANN Dark Gray
export const TEXT_SECONDARY = '#BABABA'; // HARTMANN Light Gray

// ─── Utilities ────────────────────────────────────────────────────────────────

export function truncate(text: string | number | null | undefined, max: number): string {
    const s = String(text ?? '');
    return s.length > max ? s.slice(0, max - 1) + '\u2026' : s;
}

export function topRoundedRectPath(w: number, h: number, r: number): string {
    return `M 0 ${r} Q 0 0 ${r} 0 L ${w - r} 0 Q ${w} 0 ${w} ${r} L ${w} ${h} L 0 ${h} Z`;
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
            stroke="#CBD6FF" strokeWidth={1}
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

// ─── OrgChartEntities ─────────────────────────────────────────────────────────

export interface OrgChartEntitiesProps {
    entities: Entity[];
    shareholdings: Shareholding[];
    positions: Map<string, NodePos>;
}

export const OrgChartEntities: React.FC<OrgChartEntitiesProps> = ({ entities, shareholdings, positions }) => (
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
);
