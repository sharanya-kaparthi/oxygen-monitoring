import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import type { Room } from "@/lib/types";
import { isDeviceOnline } from "@/lib/thresholds";
import { useLatestReadings } from "@/hooks/use-icu-data";
import { Plus, Pencil, Trash2 } from "lucide-react";

export default function AdminPanel() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Room | null>(null);
  const [form, setForm] = useState({ name: "", location: "", device_id: "", cylinder_expiry_date: "" });
  const [error, setError] = useState("");

  const roomIds = rooms.map((r) => r.id);
  const readings = useLatestReadings(roomIds);

  const fetchRooms = async () => {
    const { data } = await supabase.from("rooms").select("*").order("name");
    if (data) setRooms(data);
  };

  useEffect(() => { fetchRooms(); }, []);

  const resetForm = () => {
    setForm({ name: "", location: "", device_id: "", cylinder_expiry_date: "" });
    setShowForm(false);
    setEditing(null);
    setError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!form.name || !form.location || !form.device_id || !form.cylinder_expiry_date) {
      setError("All fields are required.");
      return;
    }

    // Check device_id uniqueness
    const { data: existing } = await supabase
      .from("rooms")
      .select("id")
      .eq("device_id", form.device_id)
      .neq("id", editing?.id || "00000000-0000-0000-0000-000000000000")
      .maybeSingle();

    if (existing) {
      setError("This Device ID is already assigned to another room.");
      return;
    }

    if (editing) {
      await supabase.from("rooms").update({
        name: form.name,
        location: form.location,
        device_id: form.device_id,
        cylinder_expiry_date: form.cylinder_expiry_date,
      }).eq("id", editing.id);
    } else {
      await supabase.from("rooms").insert({
        name: form.name,
        location: form.location,
        device_id: form.device_id,
        cylinder_expiry_date: form.cylinder_expiry_date,
      });
    }

    resetForm();
    fetchRooms();
  };

  const deleteRoom = async (id: string) => {
    if (!confirm("Delete this room and all its data?")) return;
    await supabase.from("rooms").delete().eq("id", id);
    fetchRooms();
  };

  const startEdit = (room: Room) => {
    setEditing(room);
    setForm({
      name: room.name,
      location: room.location,
      device_id: room.device_id,
      cylinder_expiry_date: room.cylinder_expiry_date || "",
    });
    setShowForm(true);
  };

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground">Room Management</h2>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" /> Add Room
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="mb-6 rounded-xl border border-border bg-card p-4">
          <h3 className="mb-3 font-semibold text-foreground">{editing ? "Edit Room" : "Add New Room"}</h3>
          {error && <p className="mb-3 text-sm text-status-critical">{error}</p>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="sensor-label">Room Name / Number</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder='e.g. "ICU Room 3"'
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="sensor-label">Location</label>
              <input
                type="text"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder='e.g. "Wing B, Floor 2"'
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="sensor-label">ESP32 Device ID</label>
              <input
                type="text"
                value={form.device_id}
                onChange={(e) => setForm({ ...form, device_id: e.target.value })}
                placeholder='e.g. "ESP32_ABC123"'
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="sensor-label">Cylinder Expiry Date</label>
              <input
                type="date"
                value={form.cylinder_expiry_date}
                onChange={(e) => setForm({ ...form, cylinder_expiry_date: e.target.value })}
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
              {editing ? "Save Changes" : "Add Room"}
            </button>
            <button type="button" onClick={resetForm} className="rounded-lg border border-input px-4 py-2 text-sm hover:bg-muted transition-colors">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Room list */}
      {rooms.length === 0 ? (
        <div className="py-20 text-center text-muted-foreground">No rooms configured. Click "Add Room" to get started.</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="pb-3 pr-4 text-left font-medium text-muted-foreground">Room Name</th>
                <th className="pb-3 pr-4 text-left font-medium text-muted-foreground">Location</th>
                <th className="pb-3 pr-4 text-left font-medium text-muted-foreground">Device ID</th>
                <th className="pb-3 pr-4 text-left font-medium text-muted-foreground">Expiry Date</th>
                <th className="pb-3 pr-4 text-left font-medium text-muted-foreground">Status</th>
                <th className="pb-3 text-left font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rooms.map((room) => {
                const online = isDeviceOnline(readings[room.id]?.timestamp ?? null);
                return (
                  <tr key={room.id} className="border-b border-border/50">
                    <td className="py-3 pr-4 font-medium">{room.name}</td>
                    <td className="py-3 pr-4 text-muted-foreground">{room.location}</td>
                    <td className="py-3 pr-4 font-mono text-xs text-muted-foreground">{room.device_id}</td>
                    <td className="py-3 pr-4">{room.cylinder_expiry_date || "—"}</td>
                    <td className="py-3 pr-4">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        online ? "bg-status-normal/10 text-status-normal" : "bg-muted text-muted-foreground"
                      }`}>
                        <span className={online ? "status-dot-online" : "status-dot-offline"} />
                        {online ? "Connected" : "Offline"}
                      </span>
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => startEdit(room)} className="text-muted-foreground hover:text-foreground transition-colors">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button onClick={() => deleteRoom(room.id)} className="text-muted-foreground hover:text-status-critical transition-colors">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
