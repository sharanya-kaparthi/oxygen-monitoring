export type StatusLevel = "normal" | "warning" | "critical";

export function getSpo2Status(value: number): StatusLevel {
  if (value > 94) return "normal";
  if (value >= 90) return "warning";
  return "critical";
}

export function getO2ConcentrationStatus(value: number): StatusLevel {
  if (value >= 19.5 && value <= 23.5) return "normal";
  if ((value >= 18 && value < 19.5) || (value > 23.5 && value <= 25)) return "warning";
  return "critical";
}

export function getCylinderWeightStatus(value: number): StatusLevel {
  if (value > 1500) return "normal";
  if (value >= 500) return "warning";
  return "critical";
}

export function getTemperatureStatus(value: number): StatusLevel {
  if (value >= 18 && value <= 28) return "normal";
  if ((value > 28 && value <= 32) || (value >= 15 && value < 18)) return "warning";
  return "critical";
}

export function getExpiryStatus(daysRemaining: number): StatusLevel {
  if (daysRemaining > 30) return "normal";
  if (daysRemaining >= 14) return "warning";
  return "critical";
}

export function isDeviceOnline(lastTimestamp: string | null): boolean {
  if (!lastTimestamp) return false;
  const diff = Date.now() - new Date(lastTimestamp).getTime();
  return diff < 30000; // 30 seconds
}

export function getStatusColor(status: StatusLevel): string {
  switch (status) {
    case "normal": return "text-status-normal";
    case "warning": return "text-status-warning";
    case "critical": return "text-status-critical";
  }
}

export function getStatusBgColor(status: StatusLevel): string {
  switch (status) {
    case "normal": return "bg-status-normal";
    case "warning": return "bg-status-warning";
    case "critical": return "bg-status-critical";
  }
}

export function getCardBorderColor(hasCritical: boolean, hasWarning: boolean): string {
  if (hasCritical) return "border-status-critical";
  if (hasWarning) return "border-status-warning";
  return "border-border";
}

export function getFireHazardStatus(o2Concentration: number | null, humidity: number | null): StatusLevel {
  if (o2Concentration == null || humidity == null) return "normal";
  if (o2Concentration <= 23.5 || humidity < 60) return "normal";
  // > 25% O2 OR (23.5-25% O2 with > 75% humidity) → critical
  if (o2Concentration > 25) return "critical";
  // 23.5-25% O2 range
  if (humidity > 75) return "critical";
  return "warning"; // 23.5-25% O2, 60-75% humidity
}

export function getDaysUntilExpiry(expiryDate: string | null): number | null {
  if (!expiryDate) return null;
  const diff = new Date(expiryDate).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}
