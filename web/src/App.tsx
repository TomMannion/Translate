import { NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Coffee, LayoutGrid, LineChart, Settings as Cog } from "lucide-react";
import Episodes from "./routes/Episodes.tsx";
import EpisodeDetail from "./routes/EpisodeDetail.tsx";
import Settings from "./routes/Settings.tsx";
import Usage from "./routes/Usage.tsx";

export default function App() {
  const location = useLocation();
  // Wider container on episode detail (line editor needs the room).
  const wide = location.pathname.startsWith("/episodes/");

  return (
    <div className="min-h-screen flex flex-col bg-stone-50 text-stone-900">
      <header className="border-b border-stone-200 bg-white/80 backdrop-blur sticky top-0 z-30">
        <nav className="max-w-7xl mx-auto px-6 h-14 flex items-center gap-1">
          <NavLink
            to="/"
            className="flex items-center gap-2 mr-4 font-semibold text-stone-900"
          >
            <span className="grid place-items-center w-7 h-7 rounded-md bg-amber-700 text-white">
              <Coffee className="h-4 w-4" />
            </span>
            <span>Coffee Subs</span>
          </NavLink>
          <NavItem to="/" icon={<LayoutGrid className="h-4 w-4" />}>
            Episodes
          </NavItem>
          <NavItem to="/usage" icon={<LineChart className="h-4 w-4" />}>
            Usage
          </NavItem>
          <NavItem to="/settings" icon={<Cog className="h-4 w-4" />}>
            Settings
          </NavItem>
        </nav>
      </header>
      <main
        className={`${
          wide ? "max-w-7xl" : "max-w-5xl"
        } mx-auto w-full px-6 py-8 flex-1`}
      >
        <Routes>
          <Route path="/" element={<Episodes />} />
          <Route path="/episodes/:id" element={<EpisodeDetail />} />
          <Route path="/usage" element={<Usage />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function NavItem({
  to,
  icon,
  children,
}: {
  to: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        `inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
          isActive
            ? "bg-stone-100 text-stone-900"
            : "text-stone-600 hover:bg-stone-50 hover:text-stone-900"
        }`
      }
    >
      {icon}
      <span>{children}</span>
    </NavLink>
  );
}
