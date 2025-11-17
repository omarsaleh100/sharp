import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css'; // We'll create this next
import App from './App';
import { BrowserRouter } from 'react-router-dom'; // <-- IMPORT THIS

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    {/* WRAP APP WITH THE ROUTER */}
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);