import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

// WebRTC polyfills
import 'process';
import { Buffer } from 'buffer';
window.Buffer = Buffer;

const root = createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
); 