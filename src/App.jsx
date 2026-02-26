import { Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import SetupPage from './pages/SetupPage';
import OrbPage from './pages/OrbPage';
import AdminPage from './pages/AdminPage';
import { isConnected } from './lib/gateway';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/setup" element={<SetupPage />} />
      <Route
        path="/app"
        element={isConnected() ? <OrbPage /> : <Navigate to="/setup" replace />}
      />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
