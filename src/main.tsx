import { createRoot } from 'react-dom/client';
import { App } from './app/App.tsx';
import './styles/studio.css';

const root = document.getElementById('root');
if (!root) throw new Error('No se encontró la raíz de Character Studio.');
createRoot(root).render(<App/>);
