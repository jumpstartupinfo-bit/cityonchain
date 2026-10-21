/**
 * GlobeScene — React Three Fiber 3D globe for CityOnChain world map.
 * Lazy-loaded via React.lazy in WorldMap.tsx.
 *
 * Architecture:
 *  - GlobeScene: the R3F <Canvas> + scene graph
 *  - CityDots:   InstancedMesh of all 24k cities
 *  - CityLabels: Html overlays for cities near the camera
 *  - useGlobePulse: exposes pulseCity() for ActivityFeed integration
 */

import React, {
  useRef, useState, useEffect, useCallback, useMemo,
  forwardRef, useImperativeHandle,
} from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  OrbitControls, Stars, useTexture, Html,
} from '@react-three/drei';
import * as THREE from 'three';
import { useReadContracts } from 'wagmi';
import { type Abi } from 'viem';
import { CITY_REGISTRY, CHAIN_ID } from '../contracts';
import { TIER_PRICES_USDC } from '../lib/tierConfig';
import type { City } from '../lib/merkle';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convert lat/lng (degrees) to unit sphere (x,y,z). */
function latLngToVec3(lat: number, lng: number, r = 1): THREE.Vector3 {
  const phi   = (90 - lat)  * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
     r * Math.cos(phi),
     r * Math.sin(phi) * Math.sin(theta),
  );
}

/** Hex color string → THREE.Color */
function hexToColor(hex: string): THREE.Color {
  try { return new THREE.Color(hex); }
  catch { return new THREE.Color('#4fb860'); }
}

const TIER_THREE_COLORS: Record<number, THREE.Color> = {
  1: hexToColor('#1e5228'),
  2: hexToColor('#2d7a3a'),
  3: hexToColor('#3a9648'),
  4: hexToColor('#4fb860'),
  5: hexToColor('#86c992'),
  6: hexToColor('#b2e8bd'),
};
const OWNED_COLOR   = hexToColor('#4fb860');
const PULSE_COLOR   = hexToColor('#ffcd50');
const UNOWNED_DIM   = new THREE.Color(0.6, 0.6, 0.6);

// ── CityDots — InstancedMesh ──────────────────────────────────────────────────

interface CityDotsProps {
  cities: City[];
  ownedSet: Set<number>;
  unownedOnly: boolean;
  onClickCity: (city: City) => void;
  pulseRef: React.MutableRefObject<Map<number, number>>;
  hoveredIdRef: React.MutableRefObject<number | null>;
}

function CityDots({ cities, ownedSet, unownedOnly, onClickCity, pulseRef, hoveredIdRef }: CityDotsProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const colorArr = useMemo(() => new Float32Array(cities.length * 3), [cities.length]);
  const [nowMs] = useState(() => Date.now());

  // Build positions + initial colors once
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    for (let i = 0; i < cities.length; i++) {
      const c = cities[i];
      const pos = latLngToVec3(c.lat, c.lng, 1.005);
      dummy.position.copy(pos);
      dummy.lookAt(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      const base = ownedSet.has(c.id) ? OWNED_COLOR : (TIER_THREE_COLORS[c.displayTier] ?? TIER_THREE_COLORS[6]);
      const col = (unownedOnly && ownedSet.has(c.id)) ? UNOWNED_DIM : base;
      col.toArray(colorArr, i * 3);
    }
    mesh.instanceMatrix.needsUpdate = true;

    const colAttr = new THREE.InstancedBufferAttribute(colorArr, 3);
    mesh.instanceColor = colAttr;
    mesh.instanceColor.needsUpdate = true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cities, ownedSet, unownedOnly, nowMs]);

  // Animate pulses every frame
  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh || !mesh.instanceColor) return;

    let dirty = false;
    const col = new THREE.Color();

    for (let i = 0; i < cities.length; i++) {
      const c = cities[i];
      const pulseEnd = pulseRef.current.get(c.id);
      const isHovered = hoveredIdRef.current === c.id;

      if (pulseEnd || isHovered) {
        const t = pulseEnd ? Math.max(0, (pulseEnd - Date.now()) / 2000) : 0;
        const base = ownedSet.has(c.id) ? OWNED_COLOR : (TIER_THREE_COLORS[c.displayTier] ?? TIER_THREE_COLORS[6]);
        const dimmed = unownedOnly && ownedSet.has(c.id);

        if (isHovered) {
          col.set('#ffffff');
        } else if (t > 0) {
          col.lerpColors(base, PULSE_COLOR, t);
        } else {
          col.copy(dimmed ? UNOWNED_DIM : base);
          pulseRef.current.delete(c.id);
        }
        col.toArray(colorArr, i * 3);
        dirty = true;
      }
    }

    if (dirty) {
      mesh.instanceColor.array = colorArr;
      mesh.instanceColor.needsUpdate = true;
    }
  });

  // Click detection
  const { camera, gl } = useThree();
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  raycaster.params.Points = { threshold: 0.01 };

  const handleClick = useCallback((e: MouseEvent) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const rect = gl.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width)  * 2 - 1,
      -((e.clientY - rect.top)  / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObject(mesh);
    if (hits.length > 0 && hits[0].instanceId != null) {
      onClickCity(cities[hits[0].instanceId]);
    }
  }, [camera, gl, raycaster, cities, onClickCity]);

  // Hover detection
  const handlePointerMove = useCallback((e: MouseEvent) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const rect = gl.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width)  * 2 - 1,
      -((e.clientY - rect.top)  / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObject(mesh);
    hoveredIdRef.current = hits.length > 0 && hits[0].instanceId != null
      ? cities[hits[0].instanceId].id
      : null;
  }, [camera, gl, raycaster, cities, hoveredIdRef]);

  useEffect(() => {
    const el = gl.domElement;
    el.addEventListener('click', handleClick);
    el.addEventListener('pointermove', handlePointerMove);
    return () => {
      el.removeEventListener('click', handleClick);
      el.removeEventListener('pointermove', handlePointerMove);
    };
  }, [gl, handleClick, handlePointerMove]);

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, cities.length]} frustumCulled={false}>
      <sphereGeometry args={[0.008, 5, 5]} />
      <meshStandardMaterial vertexColors toneMapped={false} />
    </instancedMesh>
  );
}

// ── CityLabels — Html overlays near camera ───────────────────────────────────

function CityLabels({ cities, ownedSet, camera, onClickCity }: {
  cities: City[];
  ownedSet: Set<number>;
  camera: THREE.Camera;
  onClickCity: (city: City) => void;
}) {
  const [visibleCities, setVisibleCities] = useState<City[]>([]);
  const [nowMs] = useState(() => Date.now());

  useFrame(() => {
    const camPos = camera.position;
    const distToSurface = camPos.length() - 1;
    if (distToSurface > 0.8) { setVisibleCities([]); return; }

    // Find cities on the near hemisphere within angular threshold
    const camDir = camPos.clone().normalize();
    const threshold = Math.max(0.1, distToSurface * 0.6);

    const near: Array<{ city: City; dist: number }> = [];
    for (const c of cities) {
      const pos = latLngToVec3(c.lat, c.lng);
      if (pos.dot(camDir) < 0.3) continue; // back of globe
      const d = pos.distanceTo(camDir);
      if (d < threshold) near.push({ city: c, dist: d });
    }
    near.sort((a, b) => a.dist - b.dist);
    setVisibleCities(near.slice(0, 12).map(n => n.city));
  });

  return (
    <>
      {visibleCities.map(c => {
        const pos = latLngToVec3(c.lat, c.lng, 1.04);
        const owned = ownedSet.has(c.id);
        const price = TIER_PRICES_USDC[c.displayTier];
        return (
          <Html key={`${c.id}-${nowMs}`} position={[pos.x, pos.y, pos.z]} center distanceFactor={1.5}>
            <div
              onClick={() => onClickCity(c)}
              style={{
                background: owned ? 'rgba(45,122,58,0.92)' : 'rgba(20,30,20,0.85)',
                backdropFilter: 'blur(8px)',
                border: `1px solid ${owned ? 'rgba(79,184,96,0.6)' : 'rgba(255,255,255,0.15)'}`,
                borderRadius: 8,
                padding: '4px 9px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                userSelect: 'none',
                pointerEvents: 'auto',
              }}
            >
              <div style={{ color: '#fff', fontWeight: 700, fontSize: 11, fontFamily: "'DM Sans',sans-serif" }}>
                {c.name}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 9, fontFamily: "'DM Sans',sans-serif" }}>
                {owned ? 'Owned' : `$${price?.toLocaleString()} USDC`}
              </div>
            </div>
          </Html>
        );
      })}
    </>
  );
}

// ── Globe mesh ────────────────────────────────────────────────────────────────

function GlobeMesh() {
  const texture = useTexture('/textures/world.jpg');
  return (
    <mesh>
      <sphereGeometry args={[1, 64, 64]} />
      <meshStandardMaterial map={texture} roughness={0.85} metalness={0.05} />
    </mesh>
  );
}

function Atmosphere() {
  return (
    <mesh>
      <sphereGeometry args={[1.025, 32, 32]} />
      <meshStandardMaterial
        color="#4fb860"
        transparent
        opacity={0.06}
        side={THREE.BackSide}
        depthWrite={false}
      />
    </mesh>
  );
}

// ── Camera fly-to ─────────────────────────────────────────────────────────────

function CameraRig({ targetRef }: {
  targetRef: React.MutableRefObject<THREE.Vector3 | null>;
}) {
  const { camera } = useThree();

  useFrame(() => {
    if (!targetRef.current) return;
    const dest = targetRef.current.clone().multiplyScalar(2.2);
    camera.position.lerp(dest, 0.04);
    if (camera.position.distanceTo(dest) < 0.01) {
      camera.position.copy(dest);
      targetRef.current = null;
    }
  });

  return null;
}

// ── Scene graph ───────────────────────────────────────────────────────────────

interface SceneProps {
  cities: City[];
  ownedSet: Set<number>;
  unownedOnly: boolean;
  onClickCity: (city: City) => void;
  pulseRef: React.MutableRefObject<Map<number, number>>;
  flyToRef: React.MutableRefObject<THREE.Vector3 | null>;
}

function Scene({ cities, ownedSet, unownedOnly, onClickCity, pulseRef, flyToRef }: SceneProps) {
  const { camera } = useThree();
  const controlsRef = useRef(null);
  const hoveredIdRef = useRef<number | null>(null);

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 3, 5]} intensity={1.2} />
      <Stars radius={120} depth={50} count={3000} factor={4} saturation={0} fade speed={0.5} />

      <GlobeMesh />
      <Atmosphere />

      <CityDots
        cities={cities}
        ownedSet={ownedSet}
        unownedOnly={unownedOnly}
        onClickCity={onClickCity}
        pulseRef={pulseRef}
        hoveredIdRef={hoveredIdRef}
      />

      <CityLabels
        cities={cities}
        ownedSet={ownedSet}
        camera={camera}
        onClickCity={onClickCity}
      />

      <CameraRig targetRef={flyToRef} />

      <OrbitControls
        ref={controlsRef}
        enablePan={false}
        minDistance={1.3}
        maxDistance={3.5}
        autoRotate
        autoRotateSpeed={0.35}
        enableDamping
        dampingFactor={0.08}
      />
    </>
  );
}

// ── Public handle ─────────────────────────────────────────────────────────────

export interface GlobeHandle {
  pulseCity: (cityId: number) => void;
  flyToCity: (lat: number, lng: number) => void;
}

// ── GlobeScene (exported, lazy-loadable) ─────────────────────────────────────

interface GlobeSceneProps {
  cities: City[];
  unownedOnly: boolean;
  onClickCity: (city: City) => void;
}

export const GlobeScene = forwardRef<GlobeHandle, GlobeSceneProps>(
  function GlobeScene({ cities, unownedOnly, onClickCity }, ref) {
    const pulseRef   = useRef<Map<number, number>>(new Map());
    const flyToRef   = useRef<THREE.Vector3 | null>(null);

    // Read total supply + ownerOf for the first 200 minted tokens (same pattern as MyAssets)
    const { data: supplyData } = useReadContracts({
      contracts: [{
        address: CITY_REGISTRY.address,
        abi: CITY_REGISTRY.abi as Abi,
        functionName: 'totalSupply' as const,
        args: [],
        chainId: CHAIN_ID,
      }],
    });
    const totalSupply = supplyData?.[0]?.status === 'success' ? Number(supplyData[0].result) : 0;

    const tokenIdQueries = useMemo(() =>
      Array.from({ length: Math.min(totalSupply, 300) }, (_, i) => ({
        address: CITY_REGISTRY.address as `0x${string}`,
        abi: CITY_REGISTRY.abi as Abi,
        functionName: 'tokenByIndex' as const,
        args: [BigInt(i)],
        chainId: CHAIN_ID,
      })),
    [totalSupply]);

    const { data: tokenIds } = useReadContracts({ contracts: tokenIdQueries });

    const ownerOfQueries = useMemo(() =>
      (tokenIds ?? [])
        .filter(r => r?.status === 'success')
        .map(r => ({
          address: CITY_REGISTRY.address as `0x${string}`,
          abi: CITY_REGISTRY.abi as Abi,
          functionName: 'ownerOf' as const,
          args: [r.result as bigint],
          chainId: CHAIN_ID,
        })),
    [tokenIds]);

    const { data: owners } = useReadContracts({ contracts: ownerOfQueries });

    const ownedSet = useMemo(() => {
      const s = new Set<number>();
      if (!tokenIds || !owners) return s;
      tokenIds.forEach((tr, i) => {
        if (tr?.status === 'success' && owners[i]?.status === 'success') {
          const id = Number(tr.result);
          s.add(id);
        }
      });
      return s;
    }, [tokenIds, owners]);

    // Expose handle
    useImperativeHandle(ref, () => ({
      pulseCity(cityId: number) {
        pulseRef.current.set(cityId, Date.now() + 2000);
      },
      flyToCity(lat: number, lng: number) {
        flyToRef.current = latLngToVec3(lat, lng);
      },
    }));

    const isMobile = typeof navigator !== 'undefined' && /Mobi/i.test(navigator.userAgent);

    return (
      <Canvas
        camera={{ position: [0, 0, 2.5], fov: 45 }}
        gl={{ antialias: !isMobile, alpha: false }}
        style={{ background: '#050f0a' }}
        dpr={isMobile ? 1 : [1, 2]}
      >
        <Scene
          cities={cities}
          ownedSet={ownedSet}
          unownedOnly={unownedOnly}
          onClickCity={onClickCity}
          pulseRef={pulseRef}
          flyToRef={flyToRef}
        />
      </Canvas>
    );
  }
);
