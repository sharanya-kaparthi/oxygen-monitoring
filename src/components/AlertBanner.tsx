import { AlertTriangle, Flame, X } from "lucide-react";
import { useAlerts, acknowledgeAlert } from "@/hooks/use-icu-data";
import { useRooms } from "@/hooks/use-icu-data";

export default function AlertBanner() {
  const { alerts, refetch } = useAlerts(false);
  const { rooms } = useRooms();

  if (alerts.length === 0) return null;

  const roomMap = Object.fromEntries(rooms.map((r) => [r.id, r.name]));

  // Sort: critical fire_hazard first, then other criticals, then warnings
  const sortedAlerts = [...alerts].sort((a, b) => {
    const priority = (alert: typeof a) => {
      if (alert.type === "fire_hazard" && alert.severity === "critical") return 0;
      if (alert.type === "fire_hazard") return 1;
      if (alert.severity === "critical") return 2;
      return 3;
    };
    return priority(a) - priority(b);
  });

  const handleAck = async (id: string) => {
    await acknowledgeAlert(id);
    refetch();
  };

  return (
    <div className="border-b border-border bg-card px-6 py-3">
      <div className="flex flex-col gap-2">
        {sortedAlerts.map((alert) => {
          const isFireHazard = alert.type === "fire_hazard";
          return (
            <div
              key={alert.id}
              className={`flex items-center justify-between rounded-lg px-4 py-2 text-sm font-medium ${
                alert.severity === "critical"
                  ? "bg-status-critical/10 text-status-critical"
                  : "bg-status-warning/10 text-status-warning"
              }`}
            >
              <div className="flex items-center gap-2">
                {isFireHazard ? (
                  <Flame className="h-4 w-4 shrink-0" />
                ) : (
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                )}
                <span className="font-semibold">{roomMap[alert.room_id] || "Unknown"}</span>
                <span>—</span>
                <span>{isFireHazard ? "Fire Hazard Risk" : ""} {alert.message}</span>
              </div>
              <button
                onClick={() => handleAck(alert.id)}
                className="ml-4 shrink-0 rounded px-3 py-1 text-xs font-semibold bg-card border border-border hover:bg-muted transition-colors text-foreground"
              >
                Acknowledge
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
