import { useState } from "react";
import { useAlerts, deleteAlert, clearAlertHistory } from "@/hooks/use-icu-data";
import { useRooms } from "@/hooks/use-icu-data";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";

export default function AlertHistory() {
  const [open, setOpen] = useState(false);
  const { alerts } = useAlerts();
  const { rooms } = useRooms();
  const roomMap = Object.fromEntries(rooms.map((r) => [r.id, r.name]));

  return (
    <div className="border-t border-border bg-card">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-6 py-3 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <span>Alert History (last 50)</span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && (
        <div className="max-h-64 overflow-auto px-6 pb-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="pb-2 pr-4 font-medium text-muted-foreground">Time</th>
                <th className="pb-2 pr-4 font-medium text-muted-foreground">Room</th>
                <th className="pb-2 pr-4 font-medium text-muted-foreground">Type</th>
                <th className="pb-2 pr-4 font-medium text-muted-foreground">Severity</th>
                <th className="pb-2 font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((a) => (
                <tr key={a.id} className="border-b border-border/50">
                  <td className="py-2 pr-4 text-muted-foreground">{new Date(a.created_at).toLocaleString()}</td>
                  <td className="py-2 pr-4">{roomMap[a.room_id] || "—"}</td>
                  <td className="py-2 pr-4">{a.type}</td>
                  <td className="py-2 pr-4">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
                      a.severity === "critical" ? "bg-status-critical/10 text-status-critical" : "bg-status-warning/10 text-status-warning"
                    }`}>
                      {a.severity}
                    </span>
                  </td>
                  <td className="py-2">{a.acknowledged ? "Acknowledged" : "Active"}</td>
                </tr>
              ))}
              {alerts.length === 0 && (
                <tr><td colSpan={5} className="py-4 text-center text-muted-foreground">No alerts</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
