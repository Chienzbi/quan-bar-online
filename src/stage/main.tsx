import { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { startStage } from './controller';

function StageApp() {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    startStage(host.current!).then((s) => { if (cancelled) s(); else stop = s; });
    return () => { cancelled = true; stop?.(); };
  }, []);
  // Chỉ có canvas: không UI, không control panel trong cảnh livestream.
  return <div ref={host} style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }} />;
}

// Không bọc StrictMode ở stage để tránh khởi tạo WebGL hai lần khi dev.
createRoot(document.getElementById('root')!).render(<StageApp />);
