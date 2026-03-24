import { useParams, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRoomReadings, useAlerts } from "@/hooks/use-icu-data";
import type { Room, Note } from "@/lib/types";
import {
  getSpo2Status, getO2ConcentrationStatus, getCylinderWeightStatus,
  getTemperatureStatus, getExpiryStatus, isDeviceOnline, getStatusColor, getDaysUntilExpiry,
} from "@/lib/thresholds";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { ArrowLeft } from "lucide-react";

function SensorChart({ data, dataKey, label, color }: { data: any[]; dataKey: string; label: string; color: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</h4>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={data}>
          <XAxis
            dataKey="timestamp"
            tickFormatter={(v) => new Date(v).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            tick={{ fontSize: 10, fill: "hsl(215,10%,50%)" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis tick={{ fontSize: 10, fill: "hsl(215,10%,50%)" }} axisLine={false} tickLine={false} width={40} />
          <Tooltip
            labelFormatter={(v) => new Date(v).toLocaleString()}
            contentStyle={{ fontSize: 12, border: "1px solid hsl(214,20%,90%)", borderRadius: 8 }}
          />
          <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function RoomDetail() {
  const { id } = useParams<{ id: string }>();
  const [room, setRoom] = useState<Room | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [newNote, setNewNote] = useState("");
  const { readings } = useRoomReadings(id!);
  const { alerts } = useAlerts();
  const roomAlerts = alerts.filter((a) => a.room_id === id);

  useEffect(() => {
    supabase.from("rooms").select("*").eq("id", id).single().then(({ data }) => {
      if (data) setRoom(data);
    });
    fetchNotes();
  }, [id]);

  const fetchNotes = async () => {
    const { data } = await supabase.from("notes").select("*").eq("room_id", id).order("created_at", { ascending: false });
    if (data) setNotes(data);
  };

  const addNote = async () => {
    if (!newNote.trim()) return;
    await supabase.from("notes").insert({ room_id: id, content: newNote.trim() });
    setNewNote("");
    fetchNotes();
  };

  if (!room) return <div className="flex items-center justify-center py-20 text-muted-foreground">Loading...</div>;

  const latest = readings[readings.length - 1] || null;
  const online = isDeviceOnline(latest?.timestamp ?? null);
  const daysUntil = getDaysUntilExpiry(room.cylinder_expiry_date);

  const statusItems = [
    { label: "SpO2", value: latest?.spo2, unit: "%", status: latest?.spo2 != null ? getSpo2Status(Number(latest.spo2)) : null },
    { label: "O₂ Concentration", value: latest?.o2_concentration, unit: "%", status: latest?.o2_concentration != null ? getO2ConcentrationStatus(Number(latest.o2_concentration)) : null },
    { label: "Temperature", value: latest?.temperature, unit: "°C", status: latest?.temperature != null ? getTemperatureStatus(Number(latest.temperature)) : null },
    { label: "Humidity", value: latest?.humidity, unit: "%", status: null },
    { label: "Cylinder Weight", value: latest?.cylinder_weight, unit: "g", status: latest?.cylinder_weight != null ? getCylinderWeightStatus(Number(latest.cylinder_weight)) : null },
    { label: "Pressure", value: latest?.pressure, unit: "hPa", status: null },
  ];

  const chartColor = "hsl(195,70%,32%)";

  return (
    <div className="p-6">
      <Link to="/nurse" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to dashboard
      </Link>

      <div className="mb-6 flex items-center gap-3">
        <h2 className="text-xl font-bold text-foreground">{room.name}</h2>
        <span className="text-sm text-muted-foreground">{room.location}</span>
        <span className={online ? "status-dot-online" : "status-dot-offline"} />
        <span className="text-xs text-muted-foreground">{online ? "Connected" : "Offline"}</span>
      </div>

      {/* Current values */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {statusItems.map((item) => (
          <div key={item.label} className="rounded-xl border border-border bg-card p-4">
            <div className="sensor-label">{item.label}</div>
            <div className={`text-3xl font-bold tabular-nums ${item.status ? getStatusColor(item.status) : "text-foreground"}`}>
              {item.value != null ? Number(item.value).toFixed(item.unit === "g" ? 0 : 1) : "—"}
              <span className="text-sm font-normal text-muted-foreground ml-0.5">{item.value != null ? item.unit : ""}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Expiry */}
      {daysUntil != null && (
        <div className={`mb-6 rounded-xl border border-border bg-card p-4 inline-block`}>
          <span className="sensor-label mr-2">Cylinder Expiry:</span>
          <span className={`font-semibold ${getStatusColor(getExpiryStatus(daysUntil))}`}>
            {daysUntil <= 0 ? "Expired" : `${daysUntil} days remaining`}
          </span>
          <span className="ml-2 text-sm text-muted-foreground">({room.cylinder_expiry_date})</span>
        </div>
      )}

      {/* Charts */}
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <SensorChart data={readings} dataKey="spo2" label="SpO2 (%) — 24h" color={chartColor} />
        <SensorChart data={readings} dataKey="o2_concentration" label="O₂ Concentration (%) — 24h" color={chartColor} />
        <SensorChart data={readings} dataKey="temperature" label="Temperature (°C) — 24h" color={chartColor} />
        <SensorChart data={readings} dataKey="humidity" label="Humidity (%) — 24h" color={chartColor} />
        <SensorChart data={readings} dataKey="cylinder_weight" label="Cylinder Weight (g) — 24h" color={chartColor} />
        <SensorChart data={readings} dataKey="pressure" label="Pressure (hPa) — 24h" color={chartColor} />
      </div>

      {/* Room alerts */}
      {roomAlerts.length > 0 && (
        <div className="mb-6">
          <h3 className="mb-2 text-sm font-semibold text-foreground">Recent Alerts</h3>
          <div className="space-y-1">
            {roomAlerts.slice(0, 10).map((a) => (
              <div key={a.id} className={`rounded-lg px-3 py-2 text-sm ${
                a.severity === "critical" ? "bg-status-critical/10 text-status-critical" : "bg-status-warning/10 text-status-warning"
              }`}>
                {a.message} — {new Date(a.created_at).toLocaleString()}
                {a.acknowledged && <span className="ml-2 text-muted-foreground">(Acknowledged)</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notes */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-3 text-sm font-semibold text-foreground">Notes</h3>
        <div className="mb-3 flex gap-2">
          <input
            type="text"
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addNote()}
            placeholder="Add a note..."
            className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            onClick={addNote}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Add Note
          </button>
        </div>
        <div className="max-h-48 space-y-2 overflow-auto">
          {notes.map((n) => (
            <div key={n.id} className="rounded-lg bg-muted px-3 py-2 text-sm">
              <p className="text-foreground">{n.content}</p>
              <p className="mt-1 text-xs text-muted-foreground">{new Date(n.created_at).toLocaleString()}</p>
            </div>
          ))}
          {notes.length === 0 && <p className="text-sm text-muted-foreground">No notes yet.</p>}
        </div>
      </div>
    </div>
  );
}
