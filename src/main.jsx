import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { registerServiceWorker } from './pwa';

createRoot(document.getElementById('root')).render(
<StrictMode>
    <App />
</StrictMode>
);

// تسجيل Service Worker لتحويل الموقع إلى PWA
registerServiceWorker();