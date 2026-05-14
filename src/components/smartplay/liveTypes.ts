export type LiveSession = {
  id: number;
  arenaId: number;
  arenaName: string | null;
  courtId: number;
  courtName: string | null;
  cameraId: number | null;
  cameraName: string | null;
  cameraUrl: string | null;
  cameraType: string | null;
  matchId: number | null;
  competitionId: number | null;
  reservationId: number | null;
  status: string;
  mode: "mock" | "real" | string;
  aiSessionId?: string | null;
  aiStatusMessage: string | null;
  fps: number | null;
  lastFrame: number | null;
  lastUpdateAt: string | null;
  players?: Array<{
    id: number;
    userId: number | null;
    slot: string;
    team: string | null;
    sideHint: string | null;
    name: string;
  }>;
};

export type LiveVisualUpdate = {
  sessionId: number;
  frame?: number;
  timestampMs?: number;
  timestamp_ms?: number;
  fps?: number;
  status?: string;
  source?: string;
  players?: Array<{
    trackId?: string | number;
    label?: string;
    team?: string;
    confidence?: number;
    // mock format: {x,y,w,h} normalised  |  FastAPI format: [x1,y1,x2,y2] pixels
    bbox?: { x: number; y: number; w: number; h: number } | [number, number, number, number];
    poseStatus?: string;
    world?: { x: number; y: number };   // FastAPI: world-metre position
    image?: { x: number; y: number };   // FastAPI: pixel centre
    poseKeypoints?: unknown;
  }>;
  // mock: {x,y}  |  FastAPI: {bbox,image,world,confidence}
  ball?: {
    x?: number; y?: number; confidence?: number;
    world?: { x: number; y: number };
    image?: { x: number; y: number };
    bbox?: [number, number, number, number] | { x: number; y: number; w: number; h: number };
  };
  minimap?: {
    players?: Array<{ id?: string; label?: string; team?: string; x: number; y: number }>;
    ball?: { x: number; y: number };
  };
  pose?: { status?: string; trackedPlayers?: number };
};
