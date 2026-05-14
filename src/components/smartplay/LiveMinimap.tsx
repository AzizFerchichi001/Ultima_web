import { useRef } from "react";
import type { LiveVisualUpdate } from "./liveTypes";

// Padel court: 10 m wide × 20 m long.
// SVG viewBox 100 × 200 — 1 SVG unit = 1 m.
// Y-axis: SVG 0 = far end (y=20m), SVG 200 = near/camera end (y=0m).
const VW = 100;
const VH = 200;
const NET_Y    = VH / 2;               // net at y=10m → svg 100
const SVC_NEAR = VH - (3 / 20) * VH;  // service line at y=3m  → svg 170
const SVC_FAR  = (3 / 20) * VH;       // service line at y=17m → svg 30
const MID_X    = VW / 2;

// Court bounds in world metres
const COURT_W = 10;
const COURT_H = 20;

// Trail lengths
const PLAYER_TRAIL = 12;
const BALL_TRAIL   = 20;

// Smoothing: lerp factor applied per update arrival (callbacks ~5-15/s)
const LERP_CLOSE = 0.55;   // small movement
const LERP_FAR   = 0.25;   // large jump — damp instead of teleport
const JUMP_THRESH_M = 2.5; // metres — above this use slower lerp

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

// World metres → SVG coordinates (clamp to court bounds first)
function wx(xm: number): number {
  const clamped = Math.max(0, Math.min(COURT_W, xm));
  return (clamped / COURT_W) * VW;
}
function wy(ym: number): number {
  const clamped = Math.max(0, Math.min(COURT_H, ym));
  return VH - (clamped / COURT_H) * VH;
}

type Pt = [number, number]; // SVG coords

interface SmoothedPos { svgX: number; svgY: number }

export default function LiveMinimap({ update }: { update: LiveVisualUpdate | null }) {
  const playerTrails    = useRef<Map<string, Pt[]>>(new Map());
  const ballTrail       = useRef<Pt[]>([]);
  const smoothedPlayers = useRef<Map<string, SmoothedPos>>(new Map());
  const smoothedBall    = useRef<SmoothedPos | null>(null);

  // Detect mock mode — mock payloads send normalized 0-1 coords, not world metres
  const isMock = update?.source === "mock" || String(update?.status ?? "").includes("mock");

  // ── Player data ──────────────────────────────────────────────────────────────
  // Priority: minimap.players (world metres) → players[].world (world metres) →
  //           players[].bbox (approximate, normalized — last resort)
  let rawPlayers: Array<{ id: string; label: string; xm: number; ym: number }> = [];

  if (update?.minimap?.players && update.minimap.players.length > 0) {
    // Primary: minimap.players[].{x,y} are always world metres from Python pipeline
    for (const p of update.minimap.players) {
      const id = String(p.id ?? "?");
      if (!["1", "2", "3", "4"].includes(id)) continue; // only valid player IDs
      const xm = isMock ? (p.x ?? 0) * COURT_W : (p.x ?? 0);
      const ym = isMock ? (p.y ?? 0) * COURT_H : (p.y ?? 0);
      rawPlayers.push({ id, label: p.label ?? `P${id}`, xm, ym });
    }
  } else if (update?.players && update.players.length > 0) {
    // Fallback: players[].world (FastAPI format, world metres)
    for (const p of update.players) {
      const world = (p as { world?: { x: number; y: number } }).world;
      if (world) {
        const id = String(p.trackId ?? (p as { id?: string | number }).id ?? "?");
        if (!["1", "2", "3", "4"].includes(id)) continue;
        rawPlayers.push({ id, label: p.label ?? `P${id}`, xm: world.x, ym: world.y });
      } else if (p.bbox && !Array.isArray(p.bbox)) {
        // Last resort: bbox normalized coords — approximate foot position
        const b = p.bbox as { x: number; y: number; w: number; h: number };
        const id = String(p.trackId ?? (p as { id?: string | number }).id ?? "?");
        if (!["1", "2", "3", "4"].includes(id)) continue;
        // bbox.{x,y} are normalized 0-1 centre; convert to approximate world metres
        const xm = (b.x + b.w / 2) * COURT_W;
        const ym = (b.y + b.h) * COURT_H; // foot of bounding box
        rawPlayers.push({ id, label: p.label ?? `P${id}`, xm, ym });
      }
    }
  }

  // ── Ball data ────────────────────────────────────────────────────────────────
  let rawBallXm: number | null = null;
  let rawBallYm: number | null = null;

  if (update?.minimap?.ball) {
    // minimap.ball.{x,y} are world metres
    rawBallXm = isMock ? (update.minimap.ball.x ?? 0) * COURT_W : (update.minimap.ball.x ?? 0);
    rawBallYm = isMock ? (update.minimap.ball.y ?? 0) * COURT_H : (update.minimap.ball.y ?? 0);
  } else {
    const ballWorld = (update?.ball as { world?: { x: number; y: number } } | undefined)?.world;
    if (ballWorld) {
      rawBallXm = ballWorld.x;
      rawBallYm = ballWorld.y;
    } else if (update?.ball?.x != null && update?.ball?.y != null) {
      // mock ball: normalized
      rawBallXm = isMock ? update.ball.x! * COURT_W : update.ball.x!;
      rawBallYm = isMock ? update.ball.y! * COURT_H : update.ball.y!;
    }
  }

  // ── Apply smoothing & accumulate trails ──────────────────────────────────────
  if (update) {
    const seenIds = new Set<string>();

    for (const { id, xm, ym } of rawPlayers) {
      seenIds.add(id);
      const targetX = wx(xm);
      const targetY = wy(ym);
      const prev = smoothedPlayers.current.get(id);

      let smoothX: number, smoothY: number;
      if (!prev) {
        smoothX = targetX;
        smoothY = targetY;
      } else {
        const dxM = Math.abs(xm - (prev.svgX / VW) * COURT_W);
        const dyM = Math.abs(ym - ((VH - prev.svgY) / VH) * COURT_H);
        const dist = Math.sqrt(dxM * dxM + dyM * dyM);
        const alpha = dist > JUMP_THRESH_M ? LERP_FAR : LERP_CLOSE;
        smoothX = lerp(prev.svgX, targetX, alpha);
        smoothY = lerp(prev.svgY, targetY, alpha);
      }

      smoothedPlayers.current.set(id, { svgX: smoothX, svgY: smoothY });
      const trail = playerTrails.current.get(id) ?? [];
      trail.push([smoothX, smoothY]);
      if (trail.length > PLAYER_TRAIL) trail.splice(0, trail.length - PLAYER_TRAIL);
      playerTrails.current.set(id, trail);
    }

    // Prune players not in this update
    for (const id of [...playerTrails.current.keys()]) {
      if (!seenIds.has(id)) {
        playerTrails.current.delete(id);
        smoothedPlayers.current.delete(id);
      }
    }

    if (rawBallXm !== null && rawBallYm !== null) {
      const targetX = wx(rawBallXm);
      const targetY = wy(rawBallYm);
      const prev = smoothedBall.current;
      let smoothX: number, smoothY: number;
      if (!prev) {
        smoothX = targetX;
        smoothY = targetY;
      } else {
        smoothX = lerp(prev.svgX, targetX, LERP_CLOSE);
        smoothY = lerp(prev.svgY, targetY, LERP_CLOSE);
      }
      smoothedBall.current = { svgX: smoothX, svgY: smoothY };
      ballTrail.current.push([smoothX, smoothY]);
      if (ballTrail.current.length > BALL_TRAIL)
        ballTrail.current.splice(0, ballTrail.current.length - BALL_TRAIL);
    }
  }

  const trails  = [...playerTrails.current.entries()];
  const ballPts = ballTrail.current;
  const ballPos = smoothedBall.current;

  return (
    <div className="relative w-full max-w-[160px] overflow-hidden rounded-lg border border-border">
      <svg
        viewBox={`0 0 ${VW} ${VH}`}
        className="w-full"
        style={{ aspectRatio: `${VW} / ${VH}`, display: "block" }}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <filter id="mm-ball-glow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Court surface */}
        <rect x={0} y={0} width={VW} height={VH} fill="rgb(90,128,60)" />

        {/* Outer boundary */}
        <rect x={0} y={0} width={VW} height={VH} fill="none" stroke="white" strokeWidth={1.5} />

        {/* Service lines at y=3m (near) and y=17m (far) */}
        <line x1={0} y1={SVC_NEAR} x2={VW} y2={SVC_NEAR} stroke="rgba(220,220,220,0.85)" strokeWidth={1} />
        <line x1={0} y1={SVC_FAR}  x2={VW} y2={SVC_FAR}  stroke="rgba(220,220,220,0.85)" strokeWidth={1} />

        {/* Centre T-line */}
        <line x1={MID_X} y1={SVC_FAR} x2={MID_X} y2={SVC_NEAR} stroke="rgba(220,220,220,0.85)" strokeWidth={1} />

        {/* Net */}
        <line x1={0} y1={NET_Y} x2={VW} y2={NET_Y} stroke="white" strokeWidth={2} />

        {/* Ball trail */}
        {ballPts.length > 1 && ballPts.map(([bx, by], i) => {
          if (i === 0) return null;
          const [px, py] = ballPts[i - 1];
          const alpha = (i / ballPts.length) * 0.7;
          return (
            <line key={`bt-${i}`}
              x1={px} y1={py} x2={bx} y2={by}
              stroke={`rgba(255,140,0,${alpha.toFixed(2)})`}
              strokeWidth={1.5} strokeLinecap="round"
            />
          );
        })}

        {/* Player trails */}
        {trails.map(([id, pts]) =>
          pts.length > 1 ? pts.map(([px, py], i) => {
            if (i === 0) return null;
            const [ox, oy] = pts[i - 1];
            const alpha = (i / pts.length) * 0.55;
            return (
              <line key={`pt-${id}-${i}`}
                x1={ox} y1={oy} x2={px} y2={py}
                stroke={`rgba(180,210,180,${alpha.toFixed(2)})`}
                strokeWidth={1} strokeLinecap="round"
              />
            );
          }) : null
        )}

        {/* Ball dot */}
        {ballPos && (
          <g filter="url(#mm-ball-glow)">
            <circle cx={ballPos.svgX} cy={ballPos.svgY} r={4.5} fill="white" />
            <circle cx={ballPos.svgX} cy={ballPos.svgY} r={3}   fill="rgb(220,40,40)" />
          </g>
        )}

        {/* Player dots */}
        {trails.map(([id, pts]) => {
          if (pts.length === 0) return null;
          const [cx, cy] = pts[pts.length - 1];
          return (
            <g key={`pd-${id}`}>
              <circle cx={cx} cy={cy} r={5}   fill="white" />
              <circle cx={cx} cy={cy} r={3.5} fill="rgb(80,200,120)" />
              <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle"
                fontSize={3.5} fontWeight="bold" fill="black">
                {id}
              </text>
            </g>
          );
        })}

        {/* Net label */}
        <text x={MID_X} y={NET_Y - 2.5} textAnchor="middle" fontSize={4}
          fill="rgba(255,255,255,0.5)" fontWeight="bold" letterSpacing={1}>
          NET
        </text>
      </svg>

      <div className="absolute bottom-1 left-1.5 right-1.5 flex items-center justify-between pointer-events-none">
        <span className="text-[8px] font-bold uppercase tracking-widest text-white/50 select-none">Court</span>
        {update?.fps != null && (
          <span className="text-[8px] font-mono text-white/50">{(update.fps as number).toFixed(1)} fps</span>
        )}
      </div>
    </div>
  );
}
