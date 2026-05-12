import { Link, Navigate, Route, Routes } from "react-router-dom";
import Episodes from "./routes/Episodes.tsx";
import EpisodeDetail from "./routes/EpisodeDetail.tsx";
import Settings from "./routes/Settings.tsx";

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-stone-200 bg-white">
        <nav className="max-w-5xl mx-auto px-6 py-3 flex items-center gap-6">
          <Link to="/" className="font-semibold text-stone-900">
            ☕ Coffee Subs
          </Link>
          <Link to="/" className="text-stone-600 hover:text-stone-900">
            Episodes
          </Link>
          <Link to="/settings" className="text-stone-600 hover:text-stone-900">
            Settings
          </Link>
        </nav>
      </header>
      <main className="max-w-5xl mx-auto w-full px-6 py-6 flex-1">
        <Routes>
          <Route path="/" element={<Episodes />} />
          <Route path="/episodes/:id" element={<EpisodeDetail />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
