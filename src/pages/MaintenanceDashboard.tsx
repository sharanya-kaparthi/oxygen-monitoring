import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRoomsWithReadings } from "@/hooks/use-icu-data";
import type { CylinderHistory } from "@/lib/types";
import {
  getCylinderWeightStatus, getExpiryStatus, isDeviceOnline,
  getStatusColor, getDaysUntilExpiry, getFireHazardStatus,
} from "@/lib/thresholds";
import { ArrowUpDown, X } from "lucide-react";

type SortKey = "name" | "cylinder_weight" | "pressure" | "expiry" | "status";
type Filter = "all" | "critical" | "warning";

export default function MaintenanceDashboard() {
  const { rooms, loading } = useRoomsWithReadings();
  const [sortKey, setSortKey] = useState<SortKey>("expiry");
  const [sortAsc, setSortAsc] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [editingExpiry, setEditingExpiry] = useState<string | null>(null);
  const [newExpiry, setNewExpiry] = useState("");
  const [historyRoomId, setHistoryRoomId] = useState<string | null>(null);
  const [history, setHistory] = useState<CylinderHistory[]>([]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  };

  const updateExpiry = async (roomId: string, oldExpiry: string | null) => {
    if (!newExpiry) return;
    // Record history
    if (oldExpiry) {
      await supabase.from("cylinder_history").insert({ room_id: roomId, expiry_date: oldExpiry });
    }
    await supabase.from("rooms").update({ cylinder_expiry_date: newExpiry }).eq("id", roomId);
    setEditingExpiry(null);
    setNewExpiry("");
    window.location.reload();
  };

  const openHistory = async (roomId: string) => {
    setHistoryRoomId(roomId);
    const { data } = await supabase.from("cylinder_history").select("*").eq("room_id", roomId).order("replaced_at", { ascending: false });
    if (data) setHistory(data);
  };

  const filteredRooms = rooms.filter((room) => {
    if (filter === "all") return true;
    const r = room.latestReading;
    const daysUntil = getDaysUntilExpiry(room.cylinder_expiry_date);
    const weightStatus = r?.cylinder_weight != null ? getCylinderWeightStatus(r.cylinder_weight) : null;
    const expiryStatus = daysUntil != null ? getExpiryStatus(daysUntil) : null;
    if (filter === "critical") return weightStatus === "critical" || expiryStatus === "critical";
    if (filter === "warning") return weightStatus === "warning" || expiryStatus === "warning";
    return true;
  });

  const sortedRooms = [...filteredRooms].sort((a, b) => {
    const dir = sortAsc ? 1 : -1;
    switch (sortKey) {
      case "name": return dir * a.name.localeCompare(b.name);
      case "cylinder_weight":
        return dir * ((a.latestReading?.cylinder_weight ?? 0) - (b.latestReading?.cylinder_weight ?? 0));
      case "pressure":
        return dir * ((Number(a.latestReading?.pressure) || 0) - (Number(b.latestReading?.pressure) || 0));
      case "expiry":
        return dir * ((getDaysUntilExpiry(a.cylinder_expiry_date) ?? 999) - (getDaysUntilExpiry(b.cylinder_expiry_date) ?? 999));
      case "status":
        return dir * (isDeviceOnline(a.latestReading?.timestamp ?? null) ? 1 : 0) - (isDeviceOnline(b.latestReading?.timestamp ?? null) ? 1 : 0);
      default: return 0;
    }
  });

  const SortHeader = ({ label, k }: { label: string; k: SortKey }) => (
    <th
      className="cursor-pointer select-none pb-3 pr-4 text-left font-medium text-muted-foreground hover:text-foreground transition-colors"
      onClick={() => handleSort(k)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown className="h-3 w-3" />
      </span>
    </th>
  );

  if (loading) return <div className="flex items-center justify-center py-20 text-muted-foreground">Loading...</div>;

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground">Cylinder Inventory</h2>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as Filter)}
          className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm outline-none"
        >
          <option value="all">Show All</option>
          <option value="critical">Critical Only</option>
          <option value="warning">Warning Only</option>
        </select>
      </div>

      {rooms.length === 0 ? (
        <div className="py-20 text-center text-muted-foreground">No ICU rooms configured yet.</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <SortHeader label="Room Name" k="name" />
                <th className="pb-3 pr-4 text-left font-medium text-muted-foreground">Location</th>
                <SortHeader label="Weight (g)" k="cylinder_weight" />
                <SortHeader label="Pressure (hPa)" k="pressure" />
                <SortHeader label="Expiry Date" k="expiry" />
                <SortHeader label="Device" k="status" />
                <th className="pb-3 pr-4 text-left font-medium text-muted-foreground">Fire Risk</th>
                <th className="pb-3 text-left font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedRooms.map((room) => {
                const r = room.latestReading;
                const online = isDeviceOnline(r?.timestamp ?? null);
                const daysUntil = getDaysUntilExpiry(room.cylinder_expiry_date);
                const weightStatus = r?.cylinder_weight != null ? getCylinderWeightStatus(r.cylinder_weight) : null;
                const expiryStatus = daysUntil != null ? getExpiryStatus(daysUntil) : null;
                const fireStatus = getFireHazardStatus(
                  r?.o2_concentration != null ? Number(r.o2_concentration) : null,
                  r?.humidity != null ? Number(r.humidity) : null
                );

                return (
                  <tr key={room.id} className="border-b border-border/50">
                    <td className="py-3 pr-4">
                      <button onClick={() => openHistory(room.id)} className="font-medium text-primary hover:underline">
                        {room.name}
                      </button>
                    </td>
                    <td className="py-3 pr-4 text-muted-foreground">{room.location}</td>
                    <td className={`py-3 pr-4 font-semibold tabular-nums ${weightStatus ? getStatusColor(weightStatus) : ""}`}>
                      {r?.cylinder_weight ?? "—"}
                    </td>
                    <td className="py-3 pr-4 tabular-nums">{r?.pressure != null ? Number(r.pressure).toFixed(1) : "—"}</td>
                    <td className={`py-3 pr-4 ${expiryStatus ? getStatusColor(expiryStatus) : ""}`}>
                      {room.cylinder_expiry_date ? (
                        <span>
                          {room.cylinder_expiry_date}
                          <span className="ml-1 text-xs">({daysUntil != null ? (daysUntil <= 0 ? "Expired" : `${daysUntil}d`) : ""})</span>
                        </span>
                      ) : "—"}
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        online ? "bg-status-normal/10 text-status-normal" : "bg-muted text-muted-foreground"
                      }`}>
                        <span className={online ? "status-dot-online" : "status-dot-offline"} />
                        {online ? "Connected" : "Offline"}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        fireStatus === "critical"
                          ? "bg-status-critical/10 text-status-critical"
                          : fireStatus === "warning"
                          ? "bg-status-warning/10 text-status-warning"
                          : "bg-status-normal/10 text-status-normal"
                      }`}>
                        {fireStatus === "normal" ? "Normal" : fireStatus === "warning" ? "Warning" : "Critical"}
                      </span>
                    </td>
                    <td className="py-3">
                      {editingExpiry === room.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="date"
                            value={newExpiry}
                            onChange={(e) => setNewExpiry(e.target.value)}
                            className="rounded border border-input bg-background px-2 py-1 text-xs"
                          />
                          <button
                            onClick={() => updateExpiry(room.id, room.cylinder_expiry_date)}
                            className="rounded bg-primary px-2 py-1 text-xs text-primary-foreground"
                          >
                            Save
                          </button>
                          <button onClick={() => setEditingExpiry(null)} className="text-muted-foreground"><X className="h-3 w-3" /></button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setEditingExpiry(room.id); setNewExpiry(room.cylinder_expiry_date || ""); }}
                          className="rounded border border-input px-2.5 py-1 text-xs hover:bg-muted transition-colors"
                        >
                          Update Expiry
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Cylinder History Panel */}
      {historyRoomId && (
        <div className="fixed inset-y-0 right-0 z-50 w-96 border-l border-border bg-card shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <h3 className="font-semibold text-foreground">Cylinder History</h3>
            <button onClick={() => setHistoryRoomId(null)} className="text-muted-foreground hover:text-foreground">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="overflow-auto p-6">
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground">No cylinder replacement history.</p>
            ) : (
              <div className="space-y-3">
                {history.map((h) => (
                  <div key={h.id} className="rounded-lg border border-border p-3">
                    <p className="text-sm font-medium text-foreground">Expiry: {h.expiry_date}</p>
                    <p className="text-xs text-muted-foreground">Replaced: {new Date(h.replaced_at).toLocaleString()}</p>
                    {h.notes && <p className="mt-1 text-xs text-muted-foreground">{h.notes}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
