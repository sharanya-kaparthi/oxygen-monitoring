export interface Room {
  id: string;
  name: string;
  location: string;
  device_id: string;
  cylinder_expiry_date: string | null;
  created_at: string;
}

export interface SensorReading {
  id: string;
  room_id: string;
  spo2: number | null;
  o2_concentration: number | null;
  temperature: number | null;
  humidity: number | null;
  pressure: number | null;
  cylinder_weight: number | null;
  timestamp: string;
  created_at: string;
}

export interface Alert {
  id: string;
  room_id: string;
  type: string;
  severity: string;
  message: string;
  acknowledged: boolean;
  acknowledged_at: string | null;
  created_at: string;
}

export interface Note {
  id: string;
  room_id: string;
  content: string;
  created_at: string;
}

export interface CylinderHistory {
  id: string;
  room_id: string;
  expiry_date: string;
  replaced_at: string;
  notes: string | null;
}

export interface RoomWithLatestReading extends Room {
  latestReading: SensorReading | null;
}
