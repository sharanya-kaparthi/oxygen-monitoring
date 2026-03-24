import { AlertTriangle, X } from "lucide-react";
import { useAlerts, acknowledgeAlert } from "@/hooks/use-icu-data";
import { useRooms } from "@/hooks/use-icu-data";

export default function AlertBanner() {
  const { alerts, refetch } = useAlerts(false);
  const { rooms } = useRooms();

  if (alerts.length === 0) return null;

  const roomMap = Object.fromEntries(rooms.map((r) => [r.id, r.name]));

  const handleAck = async (id: string) => {
    await acknowledgeAlert(id);
    refetch();
  };

  return (
    <div className="border-b border-border bg-card px-6 py-3">
      <div className="flex flex-col gap-2">
        {alerts.map((alert) => (
          <div
            key={alert.id}
            className={`flex items-center justify-between rounded-lg px-4 py-2 text-sm font-medium ${
              alert.severity === "critical"
                ? "bg-status-critical/10 text-status-critical"
                : "bg-status-warning/10 text-status-warning"
            }`}
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span className="font-semibold">{roomMap[alert.room_id] || "Unknown"}</span>
              <span>—</span>
              <span>{alert.message}</span>
            </div>
            <button
              onClick={() => handleAck(alert.id)}
              className="ml-4 shrink-0 rounded px-3 py-1 text-xs font-semibold bg-card border border-border hover:bg-muted transition-colors text-foreground"
            >
              Acknowledge
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
