import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { EffectComposer, Bloom, Noise, Vignette } from "@react-three/postprocessing";
import { Float, Text } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import type { Group, PerspectiveCamera, Points, PointLight, DirectionalLight, AmbientLight, Mesh, PointsMaterial } from "three";
import { AdditiveBlending, Color, MathUtils, Raycaster, Vector2, Vector3 } from "three";

type QualityTier = "low" | "medium" | "high";
type FocalType = "knot" | "sphere" | "diamond" | "ring" | "prism";

type ScenePreset = {
  camera: [number, number, number];
  lookAt: [number, number, number];
  fov: number;
  lightColor: string;
  fillColor: string;
  bloom: number;
  fogFar: number;
  objectColor: string;
  focal: FocalType;
  hudTitle: string;
};

type ExplosionBurst = {
  id: number;
  position: [number, number, number];
  color: string;
};

const SCENE_PRESETS: Record<string, ScenePreset> = {
  home: {
    camera: [0, 0.1, 9],
    lookAt: [0, 0, 0],
    fov: 46,
    lightColor: "#84F2FF",
    fillColor: "#00D9F5",
    bloom: 0.62,
    fogFar: 20,
    objectColor: "#4DBDFF",
    focal: "sphere",
    hudTitle: "ULTIMA CORE",
  },
  reservation: {
    camera: [1.8, -0.2, 8.2],
    lookAt: [0, -0.4, 0],
    fov: 42,
    lightColor: "#78EFFF",
    fillColor: "#25BDF2",
    bloom: 0.5,
    fogFar: 18,
    objectColor: "#6CB6FF",
    focal: "ring",
    hudTitle: "BOOKING GRID",
  },
  competitions: {
    camera: [-1.2, 0.8, 8.7],
    lookAt: [0.2, 0.1, 0],
    fov: 43,
    lightColor: "#64E8FF",
    fillColor: "#2C63BD",
    bloom: 0.58,
    fogFar: 22,
    objectColor: "#52A9FF",
    focal: "knot",
    hudTitle: "TOURNAMENT HUB",
  },
  scores: {
    camera: [0.7, -0.4, 7.6],
    lookAt: [0.1, -0.2, 0],
    fov: 40,
    lightColor: "#72E6FF",
    fillColor: "#2E79DA",
    bloom: 0.72,
    fogFar: 16,
    objectColor: "#62BFFF",
    focal: "diamond",
    hudTitle: "LIVE FEED",
  },
  performance: {
    camera: [-1.4, 0.4, 8.4],
    lookAt: [0.1, -0.1, 0],
    fov: 41,
    lightColor: "#8AF3FF",
    fillColor: "#00B8E0",
    bloom: 0.54,
    fogFar: 19,
    objectColor: "#53C8FF",
    focal: "prism",
    hudTitle: "PLAYER METRICS",
  },
  ai: {
    camera: [1, 0.9, 8.1],
    lookAt: [0, 0.2, 0],
    fov: 39,
    lightColor: "#6DEBFF",
    fillColor: "#1F8CFF",
    bloom: 0.66,
    fogFar: 17,
    objectColor: "#66C7FF",
    focal: "sphere",
    hudTitle: "SMARTPLAY NODE",
  },
  admin: {
    camera: [0, 0, 8],
    lookAt: [0, 0, 0],
    fov: 37,
    lightColor: "#74EDFF",
    fillColor: "#2C63BD",
    bloom: 0.45,
    fogFar: 15,
    objectColor: "#6CC2FF",
    focal: "ring",
    hudTitle: "CONTROL ROOM",
  },
};

function closestFromEventTarget(target: EventTarget | null, selector: string) {
  if (!(target instanceof Element)) return null;
  return target.closest(selector);
}

function getPresetForPath(pathname: string): ScenePreset {
  if (pathname.startsWith("/reservation")) return SCENE_PRESETS.reservation;
  if (pathname.startsWith("/competitions")) return SCENE_PRESETS.competitions;
  if (pathname.startsWith("/live-scores")) return SCENE_PRESETS.scores;
  if (pathname.startsWith("/performance")) return SCENE_PRESETS.performance;
  if (pathname.startsWith("/smartplay-ai")) return SCENE_PRESETS.ai;
  if (pathname.startsWith("/admin")) return SCENE_PRESETS.admin;
  return SCENE_PRESETS.home;
}

function getInitialQuality(): QualityTier {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) return "low";

  const width = window.innerWidth;
  const dpr = window.devicePixelRatio || 1;

  if (width < 720 || dpr > 2.2) return "low";
  if (width < 1200) return "medium";
  return "high";
}

function downgradeQuality(current: QualityTier): QualityTier {
  if (current === "high") return "medium";
  if (current === "medium") return "low";
  return "low";
}

function useAdaptiveQuality(pathname: string) {
  const [quality, setQuality] = useState<QualityTier>(() => getInitialQuality());

  useEffect(() => {
    const onResize = () => setQuality(getInitialQuality());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const samples: number[] = [];
    let locked = false;

    const check = (now: number) => {
      const delta = now - last;
      last = now;
      const fps = 1000 / Math.max(1, delta);
      samples.push(fps);
      if (samples.length > 120) samples.shift();

      if (!locked && samples.length >= 60) {
        const avg = samples.reduce((sum, value) => sum + value, 0) / samples.length;
        if (avg < 48) {
          setQuality((current) => downgradeQuality(current));
          locked = true;
        }
      }

      raf = window.requestAnimationFrame(check);
    };

    raf = window.requestAnimationFrame(check);
    const stopId = window.setTimeout(() => {
      window.cancelAnimationFrame(raf);
    }, 7000);

    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(stopId);
    };
  }, [pathname]);

  return quality;
}

function usePointerMotion() {
  const pointer = useRef({ x: 0, y: 0, velocity: 0, burst: 0 });

  useEffect(() => {
    let lastX = 0;
    let lastY = 0;
    let raf = 0;

    const onMove = (event: MouseEvent) => {
      const x = (event.clientX / window.innerWidth) * 2 - 1;
      const y = (event.clientY / window.innerHeight) * 2 - 1;
      const dx = x - lastX;
      const dy = y - lastY;

      pointer.current.x = x;
      pointer.current.y = y;
      pointer.current.velocity = Math.min(1.2, Math.hypot(dx, dy) * 4.5);
      lastX = x;
      lastY = y;
    };

    const onClick = () => {
      pointer.current.burst = 1;
    };

    const decay = () => {
      pointer.current.velocity = Math.max(0, pointer.current.velocity * 0.9);
      pointer.current.burst = Math.max(0, pointer.current.burst * 0.88);
      raf = window.requestAnimationFrame(decay);
    };

    raf = window.requestAnimationFrame(decay);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("click", onClick);

    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("click", onClick);
      window.cancelAnimationFrame(raf);
    };
  }, []);

  return pointer;
}

const ParticleField = ({
  pointer,
  quality,
  color,
}: {
  pointer: { current: { x: number; y: number; velocity: number; burst: number } };
  quality: QualityTier;
  color: string;
}) => {
  const pointsRef = useRef<Points>(null);
  const materialRef = useRef<PointsMaterial>(null);
  const count = quality === "high" ? 1800 : quality === "medium" ? 1200 : 700;

  const positions = useMemo(() => {
    const list = new Float32Array(count * 3);
    for (let i = 0; i < list.length; i += 3) {
      list[i] = MathUtils.randFloatSpread(24);
      list[i + 1] = MathUtils.randFloatSpread(16);
      list[i + 2] = MathUtils.randFloat(-14, 8);
    }
    return list;
  }, [count]);

  useFrame((state, delta) => {
    if (!pointsRef.current) return;
    pointsRef.current.rotation.y += delta * (0.03 + pointer.current.velocity * 0.09);
    pointsRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.08) * 0.08;
    pointsRef.current.position.x = MathUtils.lerp(pointsRef.current.position.x, pointer.current.x * 0.35, 0.03);
    pointsRef.current.position.y = MathUtils.lerp(pointsRef.current.position.y, pointer.current.y * -0.25, 0.03);

    if (materialRef.current) {
      materialRef.current.size = 0.035 + pointer.current.velocity * 0.03 + pointer.current.burst * 0.045;
      materialRef.current.opacity = 0.68 + pointer.current.burst * 0.25;
      materialRef.current.color.lerp(new Color(color), 0.08);
    }
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={positions.length / 3} array={positions} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial
        ref={materialRef}
        color={new Color(color)}
        size={0.04}
        sizeAttenuation
        transparent
        opacity={0.72}
        blending={AdditiveBlending}
      />
    </points>
  );
};

const TargetExplosion = ({
  position,
  color,
  onDone,
}: {
  position: [number, number, number];
  color: string;
  onDone: () => void;
}) => {
  const groupRef = useRef<Group>(null);
  const ageRef = useRef(0);
  const velocities = useMemo(
    () =>
      Array.from({ length: 10 }, () => [
        MathUtils.randFloatSpread(2.5),
        MathUtils.randFloat(-0.2, 2.2),
        MathUtils.randFloatSpread(2.5),
      ] as const),
    []
  );

  useFrame((_, delta) => {
    ageRef.current += delta;
    if (!groupRef.current) return;

    const age = ageRef.current;
    if (age > 0.65) {
      onDone();
      return;
    }

    const children = groupRef.current.children;
    children.forEach((child, index) => {
      const velocity = velocities[index];
      child.position.x += velocity[0] * delta;
      child.position.y += velocity[1] * delta;
      child.position.z += velocity[2] * delta;
      child.scale.setScalar(Math.max(0.08, 0.21 - age * 0.2));
      child.rotation.x += delta * 5;
      child.rotation.y += delta * 7;
    });
  });

  return (
    <group ref={groupRef} position={position}>
      {velocities.map((_, index) => (
        <mesh key={index}>
          <icosahedronGeometry args={[0.13, 0]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.3} metalness={0.45} roughness={0.35} transparent opacity={0.92} />
        </mesh>
      ))}
    </group>
  );
};

const InteractiveTargets = ({
  quality,
  pointer,
  themeColor,
  onHit,
}: {
  quality: QualityTier;
  pointer: { current: { x: number; y: number; velocity: number; burst: number } };
  themeColor: string;
  onHit: () => void;
}) => {
  const { camera, size } = useThree();
  const raycasterRef = useRef(new Raycaster());
  const pointerRef = useRef(new Vector2());
  const burstId = useRef(1);
  const targetCount = quality === "high" ? 14 : quality === "medium" ? 10 : 6;
  const [bursts, setBursts] = useState<ExplosionBurst[]>([]);
  const targets = useMemo(
    () =>
      Array.from({ length: targetCount }, (_, idx) => ({
        id: idx,
        x: MathUtils.randFloatSpread(10),
        y: MathUtils.randFloatSpread(6),
        z: MathUtils.randFloat(-6.5, -2.2),
        cooldown: 0,
      })),
    [targetCount]
  );

  const meshRefs = useRef<Array<Mesh | null>>(Array.from({ length: targetCount }, () => null));

  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime;
    targets.forEach((target, idx) => {
      const mesh = meshRefs.current[idx];
      if (!mesh) return;

      if (target.cooldown > t) {
        mesh.visible = false;
        return;
      }

      if (!mesh.visible) {
        target.x = MathUtils.randFloatSpread(10);
        target.y = MathUtils.randFloatSpread(6);
        target.z = MathUtils.randFloat(-6.5, -2.2);
        mesh.position.set(target.x, target.y, target.z);
        mesh.visible = true;
      }

      mesh.position.y += Math.sin(t * 1.5 + idx) * delta * 0.3;
      mesh.rotation.x += delta * 0.6;
      mesh.rotation.y += delta * 0.9;
      const pulse = 1 + Math.sin(t * 2.4 + idx) * 0.12 + pointer.current.velocity * 0.08;
      mesh.scale.setScalar(pulse);
    });
  });

  const triggerHit = (idx: number) => {
    const target = targets[idx];
    const mesh = meshRefs.current[idx];
    const now = performance.now() / 1000;
    if (!mesh) return;
    if (target.cooldown > now) return;

    target.cooldown = now + MathUtils.randFloat(1.25, 2.4);
    mesh.visible = false;
    pointer.current.burst = 1;
    onHit();

    const next: ExplosionBurst = {
      id: burstId.current++,
      position: [mesh.position.x, mesh.position.y, mesh.position.z],
      color: themeColor,
    };
    setBursts((prev) => [...prev.slice(-8), next]);
  };

  useEffect(() => {
    const onWindowClick = (event: MouseEvent) => {
      const interactiveUi = closestFromEventTarget(event.target, "button, a, input, textarea, select, [role='button']");
      if (interactiveUi) return;

      pointerRef.current.x = (event.clientX / size.width) * 2 - 1;
      pointerRef.current.y = -(event.clientY / size.height) * 2 + 1;
      raycasterRef.current.setFromCamera(pointerRef.current, camera);

      const candidates = meshRefs.current.filter((mesh): mesh is Mesh => Boolean(mesh?.visible));
      if (!candidates.length) return;

      const intersections = raycasterRef.current.intersectObjects(candidates, false);
      const hit = intersections[0]?.object as Mesh | undefined;
      if (!hit) return;

      const idx = meshRefs.current.findIndex((mesh) => mesh === hit);
      if (idx >= 0) triggerHit(idx);
    };

    window.addEventListener("click", onWindowClick);
    return () => window.removeEventListener("click", onWindowClick);
  }, [camera, size.width, size.height]);

  const removeBurst = (id: number) => {
    setBursts((prev) => prev.filter((burst) => burst.id !== id));
  };

  return (
    <group>
      {targets.map((target, idx) => (
        <mesh
          key={target.id}
          ref={(mesh) => {
            meshRefs.current[idx] = mesh;
          }}
          position={[target.x, target.y, target.z]}
        >
          <sphereGeometry args={[0.11, 10, 10]} />
          <meshStandardMaterial color="#fff08f" emissive="#ffea84" emissiveIntensity={0.5} metalness={0.2} roughness={0.35} />
        </mesh>
      ))}

      {bursts.map((burst) => (
        <TargetExplosion
          key={burst.id}
          position={burst.position}
          color={burst.color}
          onDone={() => removeBurst(burst.id)}
        />
      ))}
    </group>
  );
};

const FocalObject = ({ type, color }: { type: FocalType; color: string }) => {
  const material = <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.22} metalness={0.7} roughness={0.2} />;

  if (type === "ring") {
    return <mesh position={[0.35, -0.2, -1.6]} rotation={[0.8, 0.25, 0.2]}>{/* center */}
      <torusGeometry args={[1.25, 0.24, 28, 120]} />
      {material}
    </mesh>;
  }

  if (type === "diamond") {
    return <mesh position={[0.2, -0.35, -1.9]} rotation={[0.35, 0.45, 0]}>
      <octahedronGeometry args={[1.35, 1]} />
      {material}
    </mesh>;
  }

  if (type === "prism") {
    return <mesh position={[0.3, -0.25, -1.8]} rotation={[0.25, 0.6, 0.1]}>
      <cylinderGeometry args={[0.75, 1.25, 2.4, 6]} />
      {material}
    </mesh>;
  }

  if (type === "sphere") {
    return <mesh position={[0.2, -0.2, -1.8]}>
      <icosahedronGeometry args={[1.3, 2]} />
      {material}
    </mesh>;
  }

  return <mesh position={[0.2, -0.2, -1.8]} rotation={[0.2, 0.45, 0.1]}>
    <torusKnotGeometry args={[0.95, 0.28, 190, 24]} />
    {material}
  </mesh>;
};

const FloatingShapes = ({
  pointer,
  preset,
}: {
  pointer: { current: { x: number; y: number; velocity: number; burst: number } };
  preset: ScenePreset;
}) => {
  const root = useRef<Group>(null);
  const routePulse = useRef(0);
  const lastPreset = useRef(preset.hudTitle);

  useEffect(() => {
    if (lastPreset.current !== preset.hudTitle) {
      routePulse.current = 1;
      lastPreset.current = preset.hudTitle;
    }
  }, [preset.hudTitle]);

  useFrame(({ camera, clock }, delta) => {
    if (!root.current) return;
    routePulse.current = Math.max(0, routePulse.current * 0.93);
    root.current.rotation.y += delta * (0.08 + pointer.current.velocity * 0.1);
    root.current.rotation.x = Math.sin(clock.elapsedTime * 0.4) * 0.15;
    root.current.position.z = MathUtils.lerp(root.current.position.z, routePulse.current * 1.15, 0.06);
    root.current.scale.setScalar(1 + routePulse.current * 0.06);

    const cam = camera as PerspectiveCamera;
    const targetPos = new Vector3(
      preset.camera[0] + pointer.current.x * 0.45,
      preset.camera[1] + pointer.current.y * -0.35,
      preset.camera[2]
    );
    const targetLook = new Vector3(preset.lookAt[0], preset.lookAt[1], preset.lookAt[2]);

    cam.position.lerp(targetPos, 0.04);
    cam.fov = MathUtils.lerp(cam.fov, preset.fov, 0.04);
    cam.lookAt(targetLook);
    cam.updateProjectionMatrix();
  });

  return (
    <group ref={root}>
      <Float speed={1.2} rotationIntensity={0.5} floatIntensity={1.2}>
        <mesh position={[-3.4, 1.2, -2.3]} rotation={[0.3, 0.4, 0.1]}>
          <icosahedronGeometry args={[1.25, 1]} />
          <meshStandardMaterial color={preset.objectColor} emissive={preset.objectColor} emissiveIntensity={0.15} metalness={0.65} roughness={0.18} />
        </mesh>
      </Float>

      <Float speed={1.5} rotationIntensity={0.7} floatIntensity={0.9}>
        <mesh position={[2.8, -1.1, -1.6]} rotation={[0.5, -0.3, 0]}>
          <torusKnotGeometry args={[0.95, 0.25, 200, 24]} />
          <meshStandardMaterial color={preset.objectColor} emissive={preset.objectColor} emissiveIntensity={0.15} metalness={0.7} roughness={0.2} />
        </mesh>
      </Float>

      <Float speed={1.1} rotationIntensity={0.35} floatIntensity={0.85}>
        <mesh position={[0.6, 2.1, -4]}>
          <octahedronGeometry args={[0.95, 1]} />
          <meshStandardMaterial color={preset.objectColor} emissive={preset.objectColor} emissiveIntensity={0.15} metalness={0.62} roughness={0.25} />
        </mesh>
      </Float>

      <Float speed={1.25} rotationIntensity={0.25} floatIntensity={1.05}>
        <FocalObject type={preset.focal} color={preset.objectColor} />
      </Float>

      <Float speed={1} rotationIntensity={0.1} floatIntensity={0.4}>
        <group position={[-1.9, 2.85, -2.4]}>
          <mesh>
            <planeGeometry args={[2.4, 0.45]} />
            <meshStandardMaterial color="#0B1526" opacity={0.55} transparent metalness={0.1} roughness={0.45} />
          </mesh>
          <Text
            position={[-0.93, -0.01, 0.02]}
            fontSize={0.13}
            color="#C7F6FF"
            anchorX="left"
            anchorY="middle"
            letterSpacing={0.04}
          >
            {preset.hudTitle}
          </Text>
        </group>
      </Float>
    </group>
  );
};

const SceneRig = ({
  preset,
  pointer,
  quality,
  onHit,
}: {
  preset: ScenePreset;
  pointer: { current: { x: number; y: number; velocity: number; burst: number } };
  quality: QualityTier;
  onHit: () => void;
}) => {
  const ambientRef = useRef<AmbientLight>(null);
  const dirRef = useRef<DirectionalLight>(null);
  const pointRef = useRef<PointLight>(null);
  const fogMeshRef = useRef<Mesh>(null);

  useFrame((_, delta) => {
    if (ambientRef.current) {
      ambientRef.current.intensity = MathUtils.lerp(ambientRef.current.intensity, quality === "low" ? 0.38 : 0.45, 0.05);
    }

    if (dirRef.current) {
      dirRef.current.intensity = MathUtils.lerp(dirRef.current.intensity, quality === "low" ? 1.1 : 1.35, 0.05);
      dirRef.current.color.lerp(new Color(preset.lightColor), 0.07);
    }

    if (pointRef.current) {
      pointRef.current.intensity = MathUtils.lerp(pointRef.current.intensity, 0.95 + pointer.current.velocity * 0.65, 0.06);
      pointRef.current.color.lerp(new Color(preset.fillColor), 0.08);
    }

    if (fogMeshRef.current) {
      fogMeshRef.current.position.x = MathUtils.lerp(fogMeshRef.current.position.x, pointer.current.x * 0.35, 0.04);
      fogMeshRef.current.position.y = MathUtils.lerp(fogMeshRef.current.position.y, pointer.current.y * 0.2, 0.04);
      fogMeshRef.current.rotation.z += delta * 0.02;
    }
  });

  return (
    <>
      <color attach="background" args={["#070D19"]} />
      <fog attach="fog" args={["#081022", 6, preset.fogFar]} />

      <ambientLight ref={ambientRef} intensity={0.42} />
      <directionalLight ref={dirRef} position={[5, 5, 2]} intensity={1.35} color={preset.lightColor} />
      <pointLight ref={pointRef} position={[-5, -1, -1]} intensity={1.2} color={preset.fillColor} />
      <spotLight position={[0, 7, 6]} angle={0.42} penumbra={1} intensity={0.9} color="#8EF4FF" />

      <mesh ref={fogMeshRef} position={[0, 0, -6]}>
        <torusGeometry args={[5.8, 1.8, 40, 90]} />
        <meshStandardMaterial color={preset.fillColor} transparent opacity={0.08} />
      </mesh>

      <FloatingShapes pointer={pointer} preset={preset} />
      <ParticleField pointer={pointer} quality={quality} color={preset.objectColor} />
      {quality !== "low" && (
        <InteractiveTargets quality={quality} pointer={pointer} themeColor={preset.objectColor} onHit={onHit} />
      )}

      {quality !== "low" && (
        <EffectComposer multisampling={0}>
          <Bloom intensity={preset.bloom} mipmapBlur luminanceThreshold={0.15} />
          <Noise opacity={quality === "high" ? 0.035 : 0.02} />
          <Vignette offset={0.16} darkness={0.7} />
        </EffectComposer>
      )}
    </>
  );
};

const ThreeSceneBackground = () => {
  const location = useLocation();
  const quality = useAdaptiveQuality(location.pathname);
  const pointer = usePointerMotion();
  const preset = useMemo(() => getPresetForPath(location.pathname), [location.pathname]);
  const [hits, setHits] = useState(0);

  useEffect(() => {
    setHits(0);
  }, [location.pathname]);

  return (
    <div className="three-scene-layer" aria-hidden="true">
      {quality !== "low" && (
        <div className="three-game-hud">
          <span className="three-game-hud-label">Target Hits</span>
          <strong className="three-game-hud-value">{hits}</strong>
        </div>
      )}
      <Canvas
        camera={{ position: [0, 0, 9], fov: 46 }}
        dpr={quality === "high" ? [1, 1.3] : [0.9, 1.1]}
        gl={{ antialias: quality !== "low" }}
        performance={{ min: 0.6 }}
      >
        <SceneRig preset={preset} pointer={pointer} quality={quality} onHit={() => setHits((value) => value + 1)} />
      </Canvas>
    </div>
  );
};

export default ThreeSceneBackground;
