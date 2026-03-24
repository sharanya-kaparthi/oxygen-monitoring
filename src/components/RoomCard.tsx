import { Link } from "react-router-dom";
import type { RoomWithLatestReading } from "@/lib/types";
import {
  getSpo2Status,
  getO2ConcentrationStatus,
  getCylinderWeightStatus,
  getTemperatureStatus,
  getExpiryStatus,
  isDeviceOnline,
  getStatusColor,
  getCardBorderColor,
  getDaysUntilExpiry,
} from "@/lib/thresholds";

function SensorItem({ label, value, unit, status }: { label: string; value: string | number | null; unit: string; status?: string }) {
  return (
    <div>
      <div className="sensor-label">{label}</div>
      <div className={`sensor-value ${status || "text-foreground"}`}>
        {value != null ? value : "—"}
        <span className="text-sm font-normal text-muted-foreground ml-0.5">{value != null ? unit : ""}</span>
      </div>
    </div>
  );
}

export default function RoomCard({ room }: { room: RoomWithLatestReading }) {
  const r = room.latestReading;
  const online = isDeviceOnline(r?.timestamp ?? null);
  const daysUntil = getDaysUntilExpiry(room.cylinder_expiry_date);

  const spo2Status = r?.spo2 != null ? getSpo2Status(r.spo2) : null;
  const o2Status = r?.o2_concentration != null ? getO2ConcentrationStatus(r.o2_concentration) : null;
  const weightStatus = r?.cylinder_weight != null ? getCylinderWeightStatus(r.cylinder_weight) : null;
  const tempStatus = r?.temperature != null ? getTemperatureStatus(r.temperature) : null;
  const expiryStatus = daysUntil != null ? getExpiryStatus(daysUntil) : null;

  const hasCritical = [spo2Status, o2Status, weightStatus, tempStatus, expiryStatus].includes("critical");
  const hasWarning = [spo2Status, o2Status, weightStatus, tempStatus, expiryStatus].includes("warning");

  const borderClass = getCardBorderColor(hasCritical, hasWarning);

  return (
    <Link to={`/nurse/room/${room.id}`} className="block">
      <div className={`rounded-xl border-2 ${borderClass} bg-card p-4 shadow-sm transition-all hover:shadow-md ${hasCritical ? "animate-pulse-critical" : ""}`}>
        {/* Header */}
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-card-foreground">{room.name}</h3>
          <div className="flex items-center gap-1.5">
            <span className={online ? "status-dot-online" : "status-dot-offline"} />
            <span className="text-xs text-muted-foreground">{online ? "Connected" : "Offline"}</span>
          </div>
        </div>

        {/* Sensor grid */}
        <div className="grid grid-cols-2 gap-3">
          <SensorItem
            label="SpO2"
            value={r?.spo2 != null ? Number(r.spo2).toFixed(0) : null}
            unit="%"
            status={spo2Status ? getStatusColor(spo2Status) : undefined}
          />
          <SensorItem
            label="O₂ Concentration"
            value={r?.o2_concentration != null ? Number(r.o2_concentration).toFixed(1) : null}
            unit="%"
            status={o2Status ? getStatusColor(o2Status) : undefined}
          />
          <SensorItem
            label="Temperature"
            value={r?.temperature != null ? Number(r.temperature).toFixed(1) : null}
            unit="°C"
            status={tempStatus ? getStatusColor(tempStatus) : undefined}
          />
          <SensorItem
            label="Humidity"
            value={r?.humidity != null ? Number(r.humidity).toFixed(1) : null}
            unit="%"
          />
          <SensorItem
            label="Cylinder Weight"
            value={r?.cylinder_weight ?? null}
            unit="g"
            status={weightStatus ? getStatusColor(weightStatus) : undefined}
          />
          <div>
            <div className="sensor-label">Cylinder Expiry</div>
            <div className={`text-sm font-semibold ${expiryStatus ? getStatusColor(expiryStatus) : "text-muted-foreground"}`}>
              {daysUntil != null ? (daysUntil <= 0 ? "Expired" : `${daysUntil}d remaining`) : "—"}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-3 text-xs text-muted-foreground">
          {r ? `Last reading: ${new Date(r.timestamp).toLocaleTimeString()}` : "No readings yet"}
        </div>
      </div>
    </Link>
  );
}
