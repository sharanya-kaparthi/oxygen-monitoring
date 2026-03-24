import { Link, useLocation } from "react-router-dom";
import { Activity, AlertTriangle } from "lucide-react";
import { useAlerts } from "@/hooks/use-icu-data";

export default function AppHeader() {
  const location = useLocation();
  const { alerts } = useAlerts(false);
  const criticalCount = alerts.filter((a) => a.severity === "critical").length;

  const getTitle = () => {
    if (location.pathname.startsWith("/nurse/room")) return "Room Detail";
    if (location.pathname === "/nurse") return "Nurse Dashboard";
    if (location.pathname === "/maintenance") return "Maintenance Dashboard";
    if (location.pathname === "/admin") return "Admin Panel";
    return "ICU Oxygen Monitor";
  };

  const isHome = location.pathname === "/";

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-header">
      <div className="flex h-14 items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <Activity className="h-5 w-5 text-header-foreground" />
          <h1 className="text-base font-semibold text-header-foreground">{getTitle()}</h1>
        </div>
        <div className="flex items-center gap-4">
          {criticalCount > 0 && (
            <div className="flex items-center gap-1.5 rounded-full bg-status-critical px-3 py-1 text-xs font-bold text-primary-foreground animate-pulse-critical">
              <AlertTriangle className="h-3.5 w-3.5" />
              {criticalCount} Critical
            </div>
          )}
          {!isHome && (
            <Link
              to="/"
              className="text-sm font-medium text-header-foreground/80 hover:text-header-foreground transition-colors"
            >
              ← Home
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
