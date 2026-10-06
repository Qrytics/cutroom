import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './fonts.ts';
import './styles.css';
import { Home } from './ui/Home.tsx';
import { Editor } from './ui/Editor.tsx';

function App() {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const on = () => setPath(location.pathname);
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);
  const m = path.match(/^\/p\/([^/]+)/);
  return m ? <Editor key={m[1]} projectId={decodeURIComponent(m[1])} /> : <Home />;
}

export function navigate(to: string) {
  history.pushState(null, '', to);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
