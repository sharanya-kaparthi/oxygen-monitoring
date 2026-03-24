import { Link } from "react-router-dom";
import { Activity, Wrench, Settings } from "lucide-react";

export default function HomePage() {
  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center gap-10 px-6">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary">
          <Activity className="h-8 w-8 text-primary-foreground" />
        </div>
        <h2 className="text-2xl font-bold text-foreground">ICU Oxygen Monitor</h2>
        <p className="mt-1 text-sm text-muted-foreground">Select your dashboard view</p>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row">
        <Link
          to="/nurse"
          className="group flex h-40 w-64 flex-col items-center justify-center rounded-xl border-2 border-border bg-card shadow-sm transition-all hover:border-primary hover:shadow-md"
        >
          <Activity className="mb-3 h-10 w-10 text-primary transition-transform group-hover:scale-110" />
          <span className="text-lg font-semibold text-card-foreground">Nurse Dashboard</span>
          <span className="mt-1 text-xs text-muted-foreground">Patient & room monitoring</span>
        </Link>

        <Link
          to="/maintenance"
          className="group flex h-40 w-64 flex-col items-center justify-center rounded-xl border-2 border-border bg-card shadow-sm transition-all hover:border-primary hover:shadow-md"
        >
          <Wrench className="mb-3 h-10 w-10 text-primary transition-transform group-hover:scale-110" />
          <span className="text-lg font-semibold text-card-foreground">Maintenance Dashboard</span>
          <span className="mt-1 text-xs text-muted-foreground">Cylinder & supply health</span>
        </Link>
      </div>

      <Link
        to="/admin"
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <Settings className="h-4 w-4" />
        Admin Panel
      </Link>
    </div>
  );
}
