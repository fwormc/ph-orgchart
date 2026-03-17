import * as React from 'react';
import { ACCENT_COLOR } from './OrgChartEntities';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Width of the panel itself (matches IconButton width). Used for left-offset calculation. */
const PANEL_W = 36;
/** Gap from the container edge in pixels. */
const EDGE_GAP = 12;

export interface ControlPanelProps {
    zoomScale: number;
    onZoomIn: () => void;
    onZoomOut: () => void;
    onFit: () => void;
    onExport: () => void;
    exporting: boolean;
    disabled: boolean;
    /** Pixel width of the host container — used to pin the panel to the top-right. */
    containerWidth: number;
    /** Pixel height of the host container — reserved for future bottom-anchored layouts. */
    containerHeight: number;
}

// ─── Internal icon button ─────────────────────────────────────────────────────

interface IconButtonProps {
    onClick: () => void;
    disabled?: boolean;
    title: string;
    accent?: boolean;
    children: React.ReactNode;
}

const IconButton: React.FC<IconButtonProps> = ({ onClick, disabled = false, title, accent = false, children }) => {
    const [hovered, setHovered] = React.useState(false);

    return (
        <button
            onClick={onClick}
            disabled={disabled}
            title={title}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
                width: 36,
                height: 36,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: 'none',
                background: hovered && !disabled ? '#F0F0F8' : 'transparent',
                color: disabled ? '#C8C6C4' : accent ? ACCENT_COLOR : '#323130',
                cursor: disabled ? 'default' : 'pointer',
                padding: 0,
                borderRadius: 4,
                transition: 'background 0.12s, color 0.12s',
                flexShrink: 0,
            }}
        >
            {children}
        </button>
    );
};

// ─── Thin horizontal divider ──────────────────────────────────────────────────

const Divider: React.FC = () => (
    <div style={{ width: 22, height: 1, background: '#EDEBE9', margin: '2px 0' }} />
);

// ─── ControlPanel ─────────────────────────────────────────────────────────────

export const ControlPanel: React.FC<ControlPanelProps> = ({
    zoomScale,
    onZoomIn,
    onZoomOut,
    onFit,
    onExport,
    exporting,
    disabled,
    containerWidth,
    containerHeight: _containerHeight,
}) => (
    <div
        style={{
            position: 'absolute',
            top: EDGE_GAP,
            left: containerWidth - PANEL_W - EDGE_GAP,
            background: '#FFFFFF',
            borderRadius: 8,
            boxShadow: '0 2px 12px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.07)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '4px 0',
            zIndex: 10,
            userSelect: 'none',
        }}
    >
        {/* ── Zoom controls ─────────────────────────────────────────────── */}
        <IconButton onClick={onZoomIn} title="Zoom in">
            {/* Magnifier + plus */}
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="6.5" cy="6.5" r="4.5" />
                <line x1="6.5" y1="4.5" x2="6.5" y2="8.5" />
                <line x1="4.5" y1="6.5" x2="8.5" y2="6.5" />
                <line x1="10.5" y1="10.5" x2="14" y2="14" />
            </svg>
        </IconButton>

        {/* Zoom percentage */}
        <span
            style={{
                fontSize: 10,
                fontWeight: 600,
                color: '#605E5C',
                fontFamily: "'Segoe UI', system-ui, sans-serif",
                lineHeight: '20px',
                width: 36,
                textAlign: 'center',
                letterSpacing: '0.01em',
            }}
        >
            {Math.round(zoomScale * 100)}%
        </span>

        <IconButton onClick={onZoomOut} title="Zoom out">
            {/* Magnifier + minus */}
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="6.5" cy="6.5" r="4.5" />
                <line x1="4.5" y1="6.5" x2="8.5" y2="6.5" />
                <line x1="10.5" y1="10.5" x2="14" y2="14" />
            </svg>
        </IconButton>

        <Divider />

        {/* ── Fit to view ───────────────────────────────────────────────── */}
        <IconButton onClick={onFit} disabled={disabled} title="Fit all entities">
            {/* Four corner bracket arrows */}
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 5V2h3" />
                <path d="M12 2h3v3" />
                <path d="M15 11v3h-3" />
                <path d="M4 14H1v-3" />
            </svg>
        </IconButton>

        <Divider />

        {/* ── Export PDF ────────────────────────────────────────────────── */}
        <IconButton onClick={onExport} disabled={exporting || disabled} title={exporting ? 'Exporting…' : 'Export PDF'} accent>
            {/* Download arrow */}
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="8" y1="1" x2="8" y2="10" />
                <polyline points="5 7 8 10 11 7" />
                <line x1="2" y1="14" x2="14" y2="14" />
            </svg>
        </IconButton>
    </div>
);
