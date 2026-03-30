import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Home } from './pages/Home';
import { BodyShop } from './pages/BodyShop';
import { ServiceStation } from './pages/ServiceStation';
import { CRM } from './pages/CRM';
import { ErrorBoundary } from './components/ErrorBoundary';

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/body-shop" element={<BodyShop />} />
          <Route path="/service-station" element={<ServiceStation />} />
          <Route path="/tttapp" element={<CRM />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
