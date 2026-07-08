import { Component, Suspense, type ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stage, useGLTF } from '@react-three/drei';
import type { Job } from '@drukar/shared';
import { artifactUrl } from '../api/client';

function Model({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  return <primitive object={scene} />;
}

function Placeholder({ text }: { text: string }) {
  return (
    <div className="flex h-full items-center justify-center text-sm text-neutral-600">{text}</div>
  );
}

/** A failed GLB fetch/parse degrades to the placeholder instead of unmounting the app. */
class ViewerErrorBoundary extends Component<{ resetKey: string; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidUpdate(prev: { resetKey: string }): void {
    if (prev.resetKey !== this.props.resetKey && this.state.failed) {
      this.setState({ failed: false });
    }
  }

  override render(): ReactNode {
    if (this.state.failed) return <Placeholder text="Preview failed to load" />;
    return this.props.children;
  }
}

export function ModelViewer({ job }: { job: Job | undefined }) {
  if (!job?.artifacts.previewGlb) {
    return <Placeholder text="The 3D preview appears here once a model is generated" />;
  }

  const url = artifactUrl(job.id, job.artifacts.previewGlb, job.updatedAt);
  return (
    <ViewerErrorBoundary resetKey={url}>
      <Canvas camera={{ position: [0, 0, 120], fov: 45 }}>
        {/* Explicit lights: drei's environment presets fetch HDRIs from a CDN, breaking offline use. */}
        <ambientLight intensity={0.7} />
        <directionalLight position={[5, 10, 7]} intensity={2.5} />
        <directionalLight position={[-5, -2, -7]} intensity={0.8} />
        <Suspense fallback={null}>
          <Stage intensity={1} environment={null} adjustCamera={1.2}>
            <Model url={url} />
          </Stage>
        </Suspense>
        <OrbitControls makeDefault />
      </Canvas>
    </ViewerErrorBoundary>
  );
}
