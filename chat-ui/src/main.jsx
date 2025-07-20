import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/tailwind.css';

import MainLayout from './pages/index.jsx';

const root = document.getElementById('root');
ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <MainLayout />
  </React.StrictMode>
);
