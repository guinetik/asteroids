/**
 * Relay Repair Minigame — INTERACTIVE PROTOTYPE
 *
 * Grid-puzzle pipe-rotation minigame. Route the wave from IN to OUT by
 * rotating nodes until the path connects.
 *
 * Gameplay:
 *   - 5×3 grid of pipe nodes (I / L / T shapes), 13 placed cells, 2 empty
 *   - Signal enters at (0,0) from the West at 2.400 GHz
 *   - Must exit at (2,4) to the East (OUT)
 *   - Two nodes start misrotated — rotate them to complete the path
 *   - Wave traces live: aligned path shows wiggling cyan pipes with flowing packets
 *   - Quality bar fills as more of the path connects (capped at 94% until sink)
 *   - Lock-in at >= 95% (only when wave reaches sink)
 *
 * Controls:
 *   - WASD / Arrow keys  → move selection to adjacent node (skips empties)
 *   - R                   → rotate selected node 90° CW
 *   - Click a node        → select + rotate
 *   - Mousewheel over node → rotate
 *   - E                   → lock in (when path complete)
 *   - Escape              → abort EVA
 *
 * Wave-propagation rules:
 *   - A node lets the wave through only if it has a port facing the incoming direction
 *   - Wave exits through the node's remaining ports (T-pieces branch)
 *   - Branches that hit empty cells or blocked ports dead-end with an amber pulse marker
 *
 * @integration_note
 *   Wrap in OrbitalMiniGame implementation, same pattern as telescope.
 *   onLockIn payload: { missionId, quality }
 *
 * @author interactive pass — Asteroid Lander
 * @date 2026-04-19
 */
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Theme
// ─────────────────────────────────────────────────────────────────────────────

const COLOR = {
  bg:         '#05070c',
  panel:      '#0a0f1a',
  text:       '#cffafe',
  cyan:       '#22d3ee',
  cyanBright: '#7dd3fc',
  cyanDim:    'rgba(103, 232, 249, 0.3)',
  border:     'rgba(34, 211, 238, 0.25)',
  green:      '#34d399',
  amber:      '#fbbf24',
  red:        '#f87171',
  grid:       'rgba(34, 211, 238, 0.06)',
};

const MISSION = {
  id:       'saturn_titan_comms_reterm',
  name:     'Titan Uplink Backbone Reterm',
  location: 'SATURN / TITAN ORBIT',
  relay:    'TITAN-RELAY-07',
};

// ─────────────────────────────────────────────────────────────────────────────
// Grid config
// ─────────────────────────────────────────────────────────────────────────────

const CELL   = 96;
const COLS   = 5;
const ROWS   = 3;
const GRID_W = COLS * CELL;
const GRID_H = ROWS * CELL;
const NODE_R = CELL * 0.36;

// Source and sink positions
const SOURCE = { row: 0, col: 0, dir: 'E' };        // wave enters (0,0) heading E (enters W port)
const SINK   = { row: 2, col: COLS, dir: 'E' };     // wave must exit off-grid E at row 2

// ─────────────────────────────────────────────────────────────────────────────
// Shape rotations — canonical port lists (rotation 0 is canonical visual)
// ─────────────────────────────────────────────────────────────────────────────

const SHAPE_ROTATIONS = {
  I: [['E', 'W'], ['N', 'S'], ['E', 'W'], ['N', 'S']],
  L: [['N', 'E'], ['E', 'S'], ['S', 'W'], ['W', 'N']],
  T: [['N', 'E', 'S'], ['E', 'S', 'W'], ['S', 'W', 'N'], ['W', 'N', 'E']],
};

function getPorts(shape, rotation) {
  return SHAPE_ROTATIONS[shape][((rotation % 4) + 4) % 4];
}

const OPPOSITE  = { N: 'S', S: 'N', E: 'W', W: 'E' };
const DIR_DELTA = { N: [-1, 0], E: [0, 1], S: [1, 0], W: [0, -1] };

// ─────────────────────────────────────────────────────────────────────────────
// Initial puzzle state — two misrotated cells, solvable in two R presses
// ─────────────────────────────────────────────────────────────────────────────

const INITIAL_CELLS = [
  // Row 0
  { row: 0, col: 0, shape: 'L', rotation: 2, visualRotation: 2 }, // [S,W] ✓
  { row: 0, col: 1, shape: 'I', rotation: 0, visualRotation: 0 }, // decoy (off-path)
  { row: 0, col: 2, shape: 'L', rotation: 1, visualRotation: 1 }, // [E,S] ✓
  { row: 0, col: 3, shape: 'I', rotation: 1, visualRotation: 1 }, // WRONG — needs 0 or 2 for [E,W]
  { row: 0, col: 4, shape: 'L', rotation: 2, visualRotation: 2 }, // [S,W] ✓

  // Row 1 — (1,1) and (1,3) empty
  { row: 1, col: 0, shape: 'I', rotation: 1, visualRotation: 1 }, // [N,S] ✓
  { row: 1, col: 2, shape: 'T', rotation: 3, visualRotation: 3 }, // WRONG — needs 0 for [N,E,S]
  { row: 1, col: 4, shape: 'I', rotation: 1, visualRotation: 1 }, // [N,S] ✓

  // Row 2
  { row: 2, col: 0, shape: 'L', rotation: 0, visualRotation: 0 }, // [N,E] ✓
  { row: 2, col: 1, shape: 'I', rotation: 0, visualRotation: 0 }, // [E,W] ✓
  { row: 2, col: 2, shape: 'L', rotation: 3, visualRotation: 3 }, // [W,N] ✓
  { row: 2, col: 3, shape: 'I', rotation: 0, visualRotation: 0 }, // decoy (off-path)
  { row: 2, col: 4, shape: 'L', rotation: 0, visualRotation: 0 }, // [N,E] ✓
];

const IDEAL_PATH_LENGTH = 11; // cells on the correct wave path
const START_SELECTED_ID = '1-2';

// ─────────────────────────────────────────────────────────────────────────────
// Geometry helpers
// ─────────────────────────────────────────────────────────────────────────────

function cellId(row, col) { return `${row}-${col}`; }
function cellCenter(row, col) { return { cx: col * CELL + CELL / 2, cy: row * CELL + CELL / 2 }; }

function portEdge(row, col, port) {
  const { cx, cy } = cellCenter(row, col);
  const h = CELL / 2;
  switch (port) {
    case 'N': return { x: cx,     y: cy - h };
    case 'E': return { x: cx + h, y: cy     };
    case 'S': return { x: cx,     y: cy + h };
    case 'W': return { x: cx - h, y: cy     };
  }
}

function portStart(row, col, port) {
  const { cx, cy } = cellCenter(row, col);
  switch (port) {
    case 'N': return { x: cx,          y: cy - NODE_R };
    case 'E': return { x: cx + NODE_R, y: cy          };
    case 'S': return { x: cx,          y: cy + NODE_R };
    case 'W': return { x: cx - NODE_R, y: cy          };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Wave tracing (BFS with branching — T-pieces emit to all non-incoming ports)
// ─────────────────────────────────────────────────────────────────────────────

function traceWave(cells, startRow, startCol, startDir) {
  const map = new Map();
  for (const c of cells) map.set(cellId(c.row, c.col), c);

  const activeCells = new Set();
  const activeSegments = new Set(); // key: "r-c-dir" meaning wave entered (r,c) heading dir
  const exits = []; // { row, col, dir, blocked: bool }

  const queue = [{ row: startRow, col: startCol, dir: startDir }];
  const visited = new Set();

  while (queue.length > 0) {
    const { row, col, dir } = queue.shift();
    const key = `${row}-${col}-${dir}`;
    if (visited.has(key)) continue;
    visited.add(key);

    // Off grid?
    if (row < 0 || row >= ROWS || col < 0 || col >= COLS) {
      exits.push({ row, col, dir });
      continue;
    }

    const cell = map.get(cellId(row, col));
    if (!cell) {
      // empty cell — wave dies at the edge it tried to enter
      exits.push({ row, col, dir, blocked: true });
      continue;
    }

    const ports = getPorts(cell.shape, cell.rotation);
    const entering = OPPOSITE[dir]; // which side of this cell wave enters from
    if (!ports.includes(entering)) {
      // blocked — marker should appear on the previous cell's exit edge
      exits.push({ row, col, dir, blocked: true });
      continue;
    }

    activeCells.add(cellId(row, col));
    activeSegments.add(`${row}-${col}-${entering}`); // the port the wave enters through

    const otherPorts = ports.filter(p => p !== entering);
    for (const exitPort of otherPorts) {
      activeSegments.add(`${row}-${col}-${exitPort}`);
      const [dr, dc] = DIR_DELTA[exitPort];
      queue.push({ row: row + dr, col: col + dc, dir: exitPort });
    }
  }

  return { activeCells, activeSegments, exits };
}

// ─────────────────────────────────────────────────────────────────────────────
// Wiggly path generator — sine-wave perpendicular offset, fades to straight at ends
// ─────────────────────────────────────────────────────────────────────────────

function wigglyPath(x1, y1, x2, y2, time, amplitude = 2.8, wavelength = 16, speed = 5.5) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy);
  if (length < 0.1) return `M ${x1.toFixed(1)},${y1.toFixed(1)}`;
  const ux = dx / length, uy = dy / length;
  const px = -uy, py = ux;

  const steps = Math.max(6, Math.ceil(length / 3));
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const d = t * length;
    const edgeFade = Math.sin(t * Math.PI);           // 0 at ends, 1 in middle
    const phase = (d / wavelength) * Math.PI * 2 - time * speed;
    const offset = Math.sin(phase) * amplitude * edgeFade;
    const cx = x1 + ux * d + px * offset;
    const cy = y1 + uy * d + py * offset;
    pts.push(`${cx.toFixed(1)},${cy.toFixed(1)}`);
  }
  return 'M ' + pts.join(' L ');
}

// ─────────────────────────────────────────────────────────────────────────────
// Grid background — dashed lines + intersection ticks
// ─────────────────────────────────────────────────────────────────────────────

function GridBackground() {
  const ticks = [];
  for (let r = 0; r <= ROWS; r++) {
    for (let c = 0; c <= COLS; c++) {
      ticks.push({ x: c * CELL, y: r * CELL, k: `${r}-${c}` });
    }
  }
  return (
    <g>
      {Array.from({ length: ROWS + 1 }).map((_, i) => (
        <line key={`h${i}`} x1={0} y1={i * CELL} x2={GRID_W} y2={i * CELL}
              stroke={COLOR.grid} strokeWidth="1" />
      ))}
      {Array.from({ length: COLS + 1 }).map((_, i) => (
        <line key={`v${i}`} x1={i * CELL} y1={0} x2={i * CELL} y2={GRID_H}
              stroke={COLOR.grid} strokeWidth="1" />
      ))}
      {ticks.map(t => (
        <g key={t.k} stroke={COLOR.border} strokeWidth="1">
          <line x1={t.x - 3} y1={t.y} x2={t.x + 3} y2={t.y} />
          <line x1={t.x} y1={t.y - 3} x2={t.x} y2={t.y + 3} />
        </g>
      ))}
    </g>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pipe arm — inactive (static line) or active (wiggly + packets)
// ─────────────────────────────────────────────────────────────────────────────

function PipeArm({ row, col, port, active, time, idx }) {
  const s = portStart(row, col, port);
  const e = portEdge(row, col, port);
  const animName = `packets_${idx}`;

  if (!active) {
    return (
      <line x1={s.x} y1={s.y} x2={e.x} y2={e.y}
            stroke={COLOR.cyanDim} strokeWidth="2" strokeLinecap="round" />
    );
  }

  const path = wigglyPath(s.x, s.y, e.x, e.y, time);

  return (
    <g>
      {/* glow */}
      <path d={path} fill="none" stroke={COLOR.cyan} strokeWidth="10"
            opacity="0.22" strokeLinecap="round" style={{ filter: 'blur(3px)' }} />
      {/* body */}
      <path d={path} fill="none" stroke={COLOR.cyan} strokeWidth="3.5"
            strokeLinecap="round" />
      {/* flowing packets (straight line overlay for clean dash) */}
      <line x1={s.x} y1={s.y} x2={e.x} y2={e.y}
            stroke={COLOR.cyanBright} strokeWidth="1.8"
            strokeLinecap="round" strokeDasharray="3 14"
            style={{ animation: `${animName} 1s linear infinite`, opacity: 0.9 }} />
      <style>{`@keyframes ${animName} { to { stroke-dashoffset: -34; } }`}</style>
    </g>
  );
}

// Inner hub arm (from cell center to node edge — always straight, inside circle)
function HubArm({ row, col, port, active }) {
  const { cx, cy } = cellCenter(row, col);
  const s = portStart(row, col, port);
  return (
    <line x1={cx} y1={cy} x2={s.x} y2={s.y}
          stroke={active ? COLOR.cyan : COLOR.cyanDim}
          strokeWidth={active ? 3 : 2} strokeLinecap="round" />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Node — body, hub arms, outer pipes, rotation group, selection/hover states
// ─────────────────────────────────────────────────────────────────────────────

function Node({ cell, isActiveSet, isSelected, isHovered, time, onClick, onHoverIn, onHoverOut, onWheel }) {
  const { row, col, shape, rotation, visualRotation } = cell;
  const { cx, cy } = cellCenter(row, col);
  const ports = getPorts(shape, rotation);
  const canonicalPorts = SHAPE_ROTATIONS[shape][0];

  // Which ports carry active flow? Check activeSegments.
  const activeFor = (port) => isActiveSet.has(`${row}-${col}-${port}`);
  const nodeIsActive = ports.some(activeFor);

  const bodyFill = nodeIsActive
    ? 'rgba(34, 211, 238, 0.10)'
    : 'rgba(10, 15, 26, 0.92)';

  const bodyStroke = nodeIsActive
    ? COLOR.cyan
    : isHovered
    ? COLOR.cyanBright
    : 'rgba(34, 211, 238, 0.45)';

  const idx = `${row}-${col}`;

  return (
    <g
      onClick={onClick}
      onMouseEnter={onHoverIn}
      onMouseLeave={onHoverOut}
      onWheel={onWheel}
      style={{ cursor: 'pointer' }}
    >
      {/* Click/hover hit area */}
      <rect
        x={col * CELL + 4} y={row * CELL + 4}
        width={CELL - 8} height={CELL - 8}
        fill="transparent"
      />

      {/* Selection halo */}
      {isSelected && (
        <>
          <circle cx={cx} cy={cy} r={NODE_R + 12} fill="none"
                  stroke={COLOR.cyanBright} strokeWidth="1"
                  strokeDasharray="4 3" opacity="0.65"
                  style={{
                    animation: 'rotate_ring 7s linear infinite',
                    transformOrigin: `${cx}px ${cy}px`,
                  }} />
          <circle cx={cx} cy={cy} r={NODE_R + 7} fill="none"
                  stroke={COLOR.cyanBright} strokeWidth="1.5" opacity="0.55" />
        </>
      )}

      {/* Hover highlight (subtle) */}
      {isHovered && !isSelected && (
        <circle cx={cx} cy={cy} r={NODE_R + 6} fill="none"
                stroke={COLOR.cyanBright} strokeWidth="1" opacity="0.35" />
      )}

      {/* Active glow under the node body */}
      {nodeIsActive && (
        <circle cx={cx} cy={cy} r={NODE_R + 3} fill="none"
                stroke={COLOR.cyan} strokeWidth="4" opacity="0.2"
                style={{ filter: 'blur(3px)' }} />
      )}

      {/* Rotation group — pipes drawn at CANONICAL orientation, CSS rotates to visualRotation */}
      <g style={{
        transform: `rotate(${visualRotation * 90}deg)`,
        transformOrigin: `${cx}px ${cy}px`,
        transition: 'transform 260ms cubic-bezier(0.22, 0.8, 0.32, 1.05)',
      }}>
        {/* Outer pipe arms — drawn for each canonical port */}
        {canonicalPorts.map((canonPort, i) => {
          // Logical port after rotation = the port at this canonical slot's rotated destination.
          // Since the transform handles the visual rotation, the "active" status has to refer to
          // the LOGICAL port: canonical slot i in the current rotation maps to ports[i].
          const logicalPort = ports[i];
          const act = activeFor(logicalPort);
          return (
            <PipeArm
              key={canonPort}
              row={row} col={col} port={canonPort}
              active={act}
              time={time}
              idx={`${idx}-${canonPort}`}
            />
          );
        })}
        {/* Hub arms inside the circle */}
        {canonicalPorts.map((canonPort, i) => {
          const logicalPort = ports[i];
          const act = activeFor(logicalPort);
          return (
            <HubArm key={`hub-${canonPort}`} row={row} col={col} port={canonPort} active={act} />
          );
        })}
      </g>

      {/* Node body (on top of hub arms) */}
      <circle cx={cx} cy={cy} r={NODE_R} fill={bodyFill}
              stroke={bodyStroke} strokeWidth="1.5"
              style={{ transition: 'stroke 160ms, fill 160ms' }} />

      {/* Center hub */}
      <circle cx={cx} cy={cy} r={nodeIsActive ? 3.5 : 2}
              fill={nodeIsActive ? COLOR.cyanBright : 'rgba(34, 211, 238, 0.5)'}
              style={nodeIsActive ? { filter: `drop-shadow(0 0 4px ${COLOR.cyan})` } : {}} />

      {/* Shape glyph in corner (fixed, does not rotate) */}
      <text
        x={cx + NODE_R - 4} y={cy + NODE_R - 2}
        fontSize="8" fontFamily="monospace" letterSpacing="1"
        fill="rgba(103, 232, 249, 0.4)" textAnchor="end"
      >
        {shape}
      </text>

      {/* R · ROTATE hint under selected node */}
      {isSelected && (
        <text
          x={cx} y={cy + NODE_R + 22}
          fontSize="9" fontFamily="monospace" letterSpacing="1.5"
          fill={COLOR.cyanBright} textAnchor="middle"
          style={{ pointerEvents: 'none' }}
        >
          R · ROTATE
        </text>
      )}
    </g>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Signal-lost pulse marker
// ─────────────────────────────────────────────────────────────────────────────

function SignalLostMarker({ fromRow, fromCol, dir, idx }) {
  // Place marker on the edge of the cell (fromRow, fromCol) where wave exits into (row, col)
  // The "lost" edge is the far edge of the PREVIOUS cell.
  // We'll compute the edge midpoint between the cells.
  const { cx: fromCx, cy: fromCy } = cellCenter(fromRow, fromCol);
  const half = CELL / 2;
  let ex, ey;
  switch (dir) {
    case 'N': ex = fromCx;        ey = fromCy - half; break;
    case 'E': ex = fromCx + half; ey = fromCy;        break;
    case 'S': ex = fromCx;        ey = fromCy + half; break;
    case 'W': ex = fromCx - half; ey = fromCy;        break;
  }
  const animName = `lost_${idx}`;
  return (
    <g>
      <circle cx={ex} cy={ey} r="6" fill="none" stroke={COLOR.amber} strokeWidth="1"
              style={{ animation: `${animName} 1.6s ease-out infinite` }} />
      <circle cx={ex} cy={ey} r="3" fill={COLOR.amber}
              style={{ filter: `drop-shadow(0 0 5px ${COLOR.amber})` }} />
      <style>{`
        @keyframes ${animName} {
          0%   { r: 5;  opacity: 0.8; }
          100% { r: 17; opacity: 0;   }
        }
      `}</style>
    </g>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Terminal — source / sink
// ─────────────────────────────────────────────────────────────────────────────

function Terminal({ x, y, direction, label, sublabel, active }) {
  const arrowDir = direction === 'E' ? 1 : -1;
  const tipX = x + arrowDir * 18;
  const animName = `term_flow_${label}`;
  return (
    <g>
      <line x1={x} y1={y} x2={tipX} y2={y}
            stroke={active ? COLOR.green : COLOR.cyanDim}
            strokeWidth="3" strokeLinecap="round" />
      <polygon
        points={`${tipX},${y - 6} ${tipX + arrowDir * 10},${y} ${tipX},${y + 6}`}
        fill={active ? COLOR.green : COLOR.cyanDim}
      />
      {active && (
        <>
          <line x1={x - 30 * arrowDir} y1={y} x2={tipX} y2={y}
                stroke={COLOR.green} strokeWidth="2" strokeDasharray="3 8"
                style={{ animation: `${animName} 1s linear infinite` }} />
          <style>{`@keyframes ${animName} { to { stroke-dashoffset: -22; } }`}</style>
        </>
      )}
      <text x={x - arrowDir * 36} y={y - 6}
            fontSize="11" fontFamily="monospace" fill={COLOR.text}
            textAnchor={direction === 'E' ? 'end' : 'start'} letterSpacing="2" fontWeight="700">
        {label}
      </text>
      <text x={x - arrowDir * 36} y={y + 9}
            fontSize="9" fontFamily="monospace"
            fill={active ? COLOR.green : COLOR.amber}
            textAnchor={direction === 'E' ? 'end' : 'start'} letterSpacing="1.5">
        {sublabel}
      </text>
    </g>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Grid panel
// ─────────────────────────────────────────────────────────────────────────────

function SignalGridPanel({
  cells, activeCells, activeSegments, deadEnds,
  selectedId, hoveredId, time, sinkReached,
  onCellHover, onCellLeave, onCellClick, onCellWheel,
}) {
  const sourcePos = portEdge(SOURCE.row, SOURCE.col, 'W');
  const sinkPos   = portEdge(SINK.row, SINK.col - 1, 'E');

  return (
    <div style={{
      position: 'relative',
      backgroundColor: COLOR.panel,
      border: `1px solid ${COLOR.border}`,
      padding: '22px 80px 26px',
    }}>
      {[
        { top: -6, left: -6, borderTopWidth: 2, borderLeftWidth: 2 },
        { top: -6, right: -6, borderTopWidth: 2, borderRightWidth: 2 },
        { bottom: -6, left: -6, borderBottomWidth: 2, borderLeftWidth: 2 },
        { bottom: -6, right: -6, borderBottomWidth: 2, borderRightWidth: 2 },
      ].map((pos, i) => (
        <div key={i} style={{
          position: 'absolute', width: 14, height: 14,
          borderStyle: 'solid', borderColor: 'rgba(34, 211, 238, 0.5)',
          borderWidth: 0, ...pos,
        }} />
      ))}

      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        fontSize: 9, letterSpacing: '0.25em',
        color: 'rgba(103, 232, 249, 0.5)',
        marginBottom: 12,
      }}>
        <span>SIGNAL GRID · {MISSION.relay}</span>
        <span style={{ color: sinkReached ? COLOR.green : COLOR.amber }}>
          {sinkReached ? '● BACKBONE RESTORED' : '⚠ PATH INCOMPLETE'}
        </span>
      </div>

      <svg
        viewBox={`${-60} ${-20} ${GRID_W + 120} ${GRID_H + 40}`}
        style={{ width: '100%', display: 'block', maxWidth: GRID_W + 160 }}
        preserveAspectRatio="xMidYMid meet"
      >
        <GridBackground />

        {cells.map(cell => {
          const id = cellId(cell.row, cell.col);
          return (
            <Node
              key={id}
              cell={cell}
              isActiveSet={activeSegments}
              isSelected={selectedId === id}
              isHovered={hoveredId === id}
              time={time}
              onClick={(e) => { e.stopPropagation(); onCellClick(id); }}
              onHoverIn={() => onCellHover(id)}
              onHoverOut={onCellLeave}
              onWheel={(e) => { e.preventDefault(); onCellWheel(id, e.deltaY); }}
            />
          );
        })}

        {deadEnds.map((de, i) => (
          <SignalLostMarker
            key={`de-${i}`}
            fromRow={de.fromRow}
            fromCol={de.fromCol}
            dir={de.dir}
            idx={i}
          />
        ))}

        <Terminal
          x={sourcePos.x} y={sourcePos.y} direction="E"
          label="IN" sublabel="2.400 GHz · LOCKED" active={true}
        />
        <Terminal
          x={sinkPos.x} y={sinkPos.y} direction="W"
          label="OUT" sublabel={sinkReached ? 'CARRIER OK' : 'NO CARRIER'} active={sinkReached}
        />
      </svg>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Input oscilloscope — clean sine wave strip
// ─────────────────────────────────────────────────────────────────────────────

function genSine(length) {
  const pts = [];
  for (let x = 0; x < length; x += 2) {
    const y = 28 + Math.sin(x * 0.06) * 14;
    pts.push(`${x},${y}`);
  }
  return 'M ' + pts.join(' L ');
}

function InputOscilloscope() {
  const wave = useMemo(() => genSine(1200), []);
  return (
    <div style={{
      position: 'relative', height: 64,
      backgroundColor: COLOR.panel,
      border: `1px solid ${COLOR.border}`,
      overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 16,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '0 10px', fontSize: 9, letterSpacing: '0.25em',
        color: 'rgba(103, 232, 249, 0.55)', zIndex: 2,
        backgroundColor: 'rgba(5, 7, 12, 0.6)',
        borderBottom: '1px solid rgba(34, 211, 238, 0.15)',
      }}>
        <span>INPUT SIGNAL · 2.400 GHz · CLEAN</span>
        <span style={{ color: COLOR.green }}>● CARRIER LOCKED</span>
      </div>
      <svg width="100%" height="48" preserveAspectRatio="none"
           viewBox="0 0 600 56" style={{ position: 'absolute', top: 16, left: 0 }}>
        {Array.from({ length: 12 }).map((_, i) => (
          <line key={i} x1={i * 50} y1="0" x2={i * 50} y2="56"
                stroke={COLOR.grid} strokeWidth="1" />
        ))}
        <line x1="0" y1="28" x2="600" y2="28" stroke="rgba(34, 211, 238, 0.18)" strokeDasharray="2 4" />
      </svg>
      <svg width="1200" height="48" preserveAspectRatio="none"
           viewBox="0 0 1200 56"
           style={{ position: 'absolute', top: 16, left: 0,
                    animation: 'osc_scroll 4s linear infinite' }}>
        <path d={wave} fill="none" stroke={COLOR.green} strokeWidth="1.5"
              style={{ filter: `drop-shadow(0 0 2px ${COLOR.green})` }} />
      </svg>
      <style>{`@keyframes osc_scroll { from { transform: translateX(0); } to { transform: translateX(-600px); } }`}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Signal quality bar
// ─────────────────────────────────────────────────────────────────────────────

function SignalQualityBar({ quality, threshold, canLock }) {
  const pct = Math.round(quality * 100);
  const belowThreshold = quality < threshold;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between',
                    fontSize: 10, letterSpacing: '0.22em' }}>
        <span style={{ color: 'rgba(103, 232, 249, 0.6)' }}>SIGNAL QUALITY</span>
        <span style={{ color: canLock ? COLOR.green : belowThreshold ? COLOR.amber : COLOR.cyanBright,
                       fontFamily: 'monospace' }}>
          {pct.toString().padStart(3, '0')}% {belowThreshold ? '· BELOW THRESHOLD' : '· LOCKED'}
        </span>
      </div>
      <div style={{ position: 'relative', height: 8,
                    backgroundColor: 'rgba(34, 211, 238, 0.1)',
                    border: `1px solid ${COLOR.border}`, overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', left: 0, top: 0, height: '100%',
          width: `${pct}%`,
          background: canLock
            ? 'linear-gradient(90deg, #10b981, #34d399)'
            : belowThreshold
            ? 'linear-gradient(90deg, #b45309, #fbbf24)'
            : 'linear-gradient(90deg, #0891b2, #22d3ee)',
          boxShadow: canLock
            ? '0 0 10px rgba(52, 211, 153, 0.5)'
            : belowThreshold
            ? '0 0 10px rgba(251, 191, 36, 0.45)'
            : '0 0 8px rgba(34, 211, 238, 0.4)',
          transition: 'width 180ms ease-out, background 300ms',
        }} />
        <div style={{ position: 'absolute', top: 0, height: '100%', width: 1,
                      left: `${threshold * 100}%`,
                      backgroundColor: 'rgba(52, 211, 153, 0.6)',
                      boxShadow: '0 0 6px rgba(52, 211, 153, 0.4)' }} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Success overlay
// ─────────────────────────────────────────────────────────────────────────────

function SuccessOverlay({ onRestart }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => { const t = setTimeout(() => setVisible(true), 150); return () => clearTimeout(t); }, []);
  return (
    <div style={{
      position: 'fixed', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backgroundColor: 'rgba(5, 7, 12, 0.55)',
      backdropFilter: 'blur(4px)',
      opacity: visible ? 1 : 0,
      transition: 'opacity 400ms ease-out',
      pointerEvents: visible ? 'auto' : 'none',
      zIndex: 100,
    }}>
      <div style={{
        border: `1px solid ${COLOR.green}`,
        backgroundColor: 'rgba(5, 7, 12, 0.95)',
        padding: '24px 48px',
        textAlign: 'center',
        boxShadow: `0 0 40px rgba(52, 211, 153, 0.3)`,
      }}>
        <div style={{ fontSize: 10, letterSpacing: '0.35em', color: 'rgba(52, 211, 153, 0.8)', marginBottom: 8 }}>
          — CAPTURE FRAME —
        </div>
        <div style={{ fontSize: 18, letterSpacing: '0.15em', color: COLOR.green, marginBottom: 6 }}>
          RELAY RESTORED
        </div>
        <div style={{ fontSize: 11, letterSpacing: '0.1em', color: 'rgba(207, 250, 254, 0.75)', marginBottom: 4 }}>
          TITAN uplink backbone nominal
        </div>
        <div style={{ fontSize: 10, letterSpacing: '0.1em', color: 'rgba(207, 250, 254, 0.55)', marginBottom: 20 }}>
          carrier 2.400 GHz · packet loss 0%
        </div>
        <button
          onClick={onRestart}
          style={{
            padding: '8px 24px',
            fontSize: 11,
            letterSpacing: '0.25em',
            border: `1px solid ${COLOR.cyan}`,
            color: COLOR.text,
            backgroundColor: 'transparent',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(34, 211, 238, 0.1)'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          RESTART · DEV
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main game component
// ─────────────────────────────────────────────────────────────────────────────

function RelayRepairMinigame({ onLockIn, onAbort }) {
  const [cells, setCells] = useState(INITIAL_CELLS);
  const [selectedId, setSelectedId] = useState(START_SELECTED_ID);
  const [hoveredId, setHoveredId] = useState(null);
  const [lockState, setLockState] = useState('calibrating'); // 'calibrating' | 'locking' | 'locked'
  const [time, setTime] = useState(0);

  // Animation loop for wiggle
  useEffect(() => {
    if (lockState === 'locked') return;
    let raf;
    let last = performance.now();
    const tick = (now) => {
      const dt = (now - last) / 1000;
      last = now;
      setTime(t => t + dt);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [lockState]);

  // Trace wave
  const { activeCells, activeSegments, exits } = useMemo(
    () => traceWave(cells, SOURCE.row, SOURCE.col, SOURCE.dir),
    [cells]
  );

  // Did wave exit at the sink?
  const sinkReached = useMemo(
    () => exits.some(e => e.row === SINK.row && e.col === SINK.col && e.dir === SINK.dir),
    [exits]
  );

  // Dead-end markers — every exit that isn't the sink, mapped to "from cell" edge
  const deadEnds = useMemo(() => {
    const list = [];
    for (const e of exits) {
      // Skip the successful sink exit
      if (e.row === SINK.row && e.col === SINK.col && e.dir === SINK.dir) continue;
      // The "from" cell is one step back along the direction
      const [dr, dc] = DIR_DELTA[e.dir];
      const fromRow = e.row - dr;
      const fromCol = e.col - dc;
      // Only mark if the "from" cell was active (otherwise the wave never got there)
      if (activeCells.has(cellId(fromRow, fromCol))) {
        list.push({ fromRow, fromCol, dir: e.dir });
      }
    }
    return list;
  }, [exits, activeCells]);

  const quality = useMemo(() => {
    if (sinkReached) return 1.0;
    return Math.min(0.94, (activeCells.size / IDEAL_PATH_LENGTH) * 0.9);
  }, [activeCells, sinkReached]);

  const canLock = quality >= 0.95 && lockState === 'calibrating';

  // Handlers
  const handleRotate = useCallback((id) => {
    if (lockState !== 'calibrating') return;
    setCells(cs => cs.map(c =>
      cellId(c.row, c.col) === id
        ? { ...c, rotation: (c.rotation + 1) % 4, visualRotation: c.visualRotation + 1 }
        : c
    ));
  }, [lockState]);

  const handleClick = useCallback((id) => {
    if (lockState !== 'calibrating') return;
    setSelectedId(id);
    handleRotate(id);
  }, [lockState, handleRotate]);

  const handleWheel = useCallback((id, deltaY) => {
    if (lockState !== 'calibrating') return;
    setSelectedId(id);
    // either direction rotates CW — simpler UX than tracking dir
    handleRotate(id);
  }, [lockState, handleRotate]);

  const handleMoveSelection = useCallback((dir) => {
    if (lockState !== 'calibrating') return;
    const current = cells.find(c => cellId(c.row, c.col) === selectedId);
    if (!current) return;
    const [dr, dc] = DIR_DELTA[dir];
    const target = cells.find(c => c.row === current.row + dr && c.col === current.col + dc);
    if (target) setSelectedId(cellId(target.row, target.col));
  }, [cells, selectedId, lockState]);

  const handleLockIn = useCallback(() => {
    if (!canLock) return;
    setLockState('locking');
    setTimeout(() => {
      setLockState('locked');
      if (onLockIn) onLockIn({ missionId: MISSION.id, quality });
    }, 450);
  }, [canLock, quality, onLockIn]);

  const handleRestart = useCallback(() => {
    setCells(INITIAL_CELLS);
    setSelectedId(START_SELECTED_ID);
    setLockState('calibrating');
    setTime(0);
  }, []);

  // Keyboard
  useEffect(() => {
    const onKey = (e) => {
      if (lockState === 'locked') {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleRestart(); }
        return;
      }
      const k = e.key.toLowerCase();
      if      (k === 'w' || e.key === 'ArrowUp')    { e.preventDefault(); handleMoveSelection('N'); }
      else if (k === 's' || e.key === 'ArrowDown')  { e.preventDefault(); handleMoveSelection('S'); }
      else if (k === 'a' || e.key === 'ArrowLeft')  { e.preventDefault(); handleMoveSelection('W'); }
      else if (k === 'd' || e.key === 'ArrowRight') { e.preventDefault(); handleMoveSelection('E'); }
      else if (k === 'r')           { e.preventDefault(); handleRotate(selectedId); }
      else if (k === 'e' && canLock){ e.preventDefault(); handleLockIn(); }
      else if (k === 'escape')      { if (onAbort) onAbort(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleMoveSelection, handleRotate, selectedId, canLock, handleLockIn, lockState, handleRestart, onAbort]);

  // Status UI
  const statusText = lockState === 'locked'
    ? 'BACKBONE RESTORED'
    : lockState === 'locking'
    ? 'LOCKING IN'
    : sinkReached
    ? 'SIGNAL LOCK AVAILABLE'
    : 'PATH INCOMPLETE';

  const statusColor = lockState !== 'calibrating' || sinkReached
    ? COLOR.green
    : COLOR.amber;

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      minHeight: '100vh',
      backgroundColor: COLOR.bg,
      color: COLOR.text,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      display: 'flex',
      justifyContent: 'center',
      overflow: 'hidden',
      backgroundImage: 'radial-gradient(circle at 50% 25%, rgba(34, 211, 238, 0.05), transparent 60%)',
    }}>
      <style>{`
        @keyframes rotate_ring { to { transform: rotate(360deg); } }
        @keyframes blink_warn { 0%, 100% { opacity: 0.7; } 50% { opacity: 1; } }
        @keyframes lock_pulse { 0%, 100% { opacity: 0.75; } 50% { opacity: 1; } }
      `}</style>

      <div style={{
        width: '100%', maxWidth: 820,
        padding: '32px 16px',
        display: 'flex', flexDirection: 'column', gap: 18,
      }}>
        {/* Status bar */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          fontSize: 11, letterSpacing: '0.22em',
          borderTop: `1px solid ${COLOR.border}`,
          borderBottom: `1px solid ${COLOR.border}`,
          padding: '8px 12px',
        }}>
          <span style={{ color: 'rgba(103, 232, 249, 0.6)' }}>EVA / RELAY BAY · {MISSION.location}</span>
          <span style={{ color: 'rgba(207, 250, 254, 0.9)' }}>{MISSION.name.toUpperCase()}</span>
          <span style={{
            color: statusColor,
            animation: canLock ? 'lock_pulse 1.3s ease-in-out infinite' : lockState === 'calibrating' ? 'blink_warn 1.5s ease-in-out infinite' : 'none',
          }}>
            {sinkReached && lockState === 'calibrating' ? '⟐ ' : lockState === 'calibrating' ? '⚠ ' : '● '}{statusText}
          </span>
        </div>

        <InputOscilloscope />

        <SignalGridPanel
          cells={cells}
          activeCells={activeCells}
          activeSegments={activeSegments}
          deadEnds={deadEnds}
          selectedId={selectedId}
          hoveredId={hoveredId}
          time={time}
          sinkReached={sinkReached}
          onCellHover={setHoveredId}
          onCellLeave={() => setHoveredId(null)}
          onCellClick={handleClick}
          onCellWheel={handleWheel}
        />

        <SignalQualityBar quality={quality} threshold={0.95} canLock={canLock} />

        {/* Controls hint */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          fontSize: 10, letterSpacing: '0.15em',
          color: 'rgba(103, 232, 249, 0.55)',
          borderTop: '1px solid rgba(34, 211, 238, 0.12)',
          paddingTop: 12,
        }}>
          <span>WASD · MOVE · CLICK NODE · WHEEL</span>
          <span>R · ROTATE · ESC ABORT</span>
          <span style={{
            color: canLock ? COLOR.green : 'rgba(103, 232, 249, 0.3)',
            animation: canLock ? 'lock_pulse 1.2s ease-in-out infinite' : 'none',
          }}>
            {canLock ? '⟐ E — LOCK IN' : 'E — LOCK IN'}
          </span>
        </div>
      </div>

      {lockState === 'locked' && <SuccessOverlay onRestart={handleRestart} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Default export — demo wrapper
// ─────────────────────────────────────────────────────────────────────────────

export default function RelayRepairDemo() {
  return (
    <RelayRepairMinigame
      onLockIn={(payload) => { console.log('[LOCK IN]', payload); }}
      onAbort={() => { console.log('[ABORT]'); }}
    />
  );
}
