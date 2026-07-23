import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, Sphere, MeshDistortMaterial, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';

const ToolIcon = ({ position, color, speed, size }: { position: [number, number, number], color: string, speed: number, size: number }) => {
  const mesh = useRef<THREE.Mesh>(null);
  
  useFrame((state) => {
    const t = state.clock.getElapsedTime() * speed;
    if (mesh.current) {
       mesh.current.position.y += Math.sin(t) * 0.002;
       mesh.current.rotation.x += 0.01;
       mesh.current.rotation.y += 0.01;
    }
  });

  return (
    <Float speed={speed * 2} rotationIntensity={1} floatIntensity={1}>
      <mesh ref={mesh} position={position}>
        <boxGeometry args={[size, size, size]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </Float>
  );
};

const OrbitGroup = () => {
  const group = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (group.current) {
      group.current.rotation.y = state.clock.getElapsedTime() * 0.1;
    }
  });

  const tools = useMemo(() => {
    const colors = ['#2563EB', '#3B82F6', '#60A5FA', '#93C5FD', '#1E40AF'];
    return Array.from({ length: 15 }).map((_, i) => ({
      position: [
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 8,
        (Math.random() - 0.5) * 6
      ] as [number, number, number],
      color: colors[i % colors.length],
      speed: 0.5 + Math.random(),
      size: 0.15 + Math.random() * 0.2
    }));
  }, []);

  return (
    <group ref={group}>
      {tools.map((tool, i) => (
        <ToolIcon key={i} {...tool} />
      ))}
      <Sphere args={[1, 64, 64]} scale={2}>
        <MeshDistortMaterial
          color="#3B82F6"
          speed={2}
          distort={0.4}
          radius={1}
          opacity={0.1}
          transparent
        />
      </Sphere>
    </group>
  );
};

export default function CreatorOrbit() {
  return (
    <div className="absolute inset-0 -z-10 pointer-events-none">
      <Canvas>
        <PerspectiveCamera makeDefault position={[0, 0, 10]} fov={50} />
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} intensity={1} color="#3B82F6" />
        <OrbitGroup />
      </Canvas>
    </div>
  );
}
