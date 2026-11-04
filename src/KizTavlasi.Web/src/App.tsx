import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import HomePage from './pages/HomePage';
import Toast from './components/Toast';

// Oda/oyun ekranı (tahta, SignalR istemcisi, animasyonlar) yalnızca odaya girilince yüklenir.
const RoomPage = lazy(() => import('./pages/RoomPage'));

function RouteFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center" role="status">
      <span className="text-sm text-cream-300">Masa hazırlanıyor…</span>
    </div>
  );
}

export default function App() {
  return (
    <>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/oda/:roomCode" element={<RoomPage />} />
          <Route path="*" element={<HomePage />} />
        </Routes>
      </Suspense>
      <Toast />
    </>
  );
}
