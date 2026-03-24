-- Create rooms table
CREATE TABLE public.rooms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  location TEXT NOT NULL,
  device_id TEXT NOT NULL UNIQUE,
  cylinder_expiry_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create sensor_readings table
CREATE TABLE public.sensor_readings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  spo2 NUMERIC,
  o2_concentration NUMERIC,
  temperature NUMERIC,
  humidity NUMERIC,
  pressure NUMERIC,
  cylinder_weight INTEGER,
  timestamp TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create alerts table
CREATE TABLE public.alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  severity TEXT NOT NULL,
  message TEXT NOT NULL,
  acknowledged BOOLEAN NOT NULL DEFAULT false,
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create notes table
CREATE TABLE public.notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create cylinder_history table
CREATE TABLE public.cylinder_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  expiry_date DATE NOT NULL,
  replaced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT
);

-- Create indexes
CREATE INDEX idx_sensor_readings_room_id ON public.sensor_readings(room_id);
CREATE INDEX idx_sensor_readings_timestamp ON public.sensor_readings(timestamp DESC);
CREATE INDEX idx_sensor_readings_room_timestamp ON public.sensor_readings(room_id, timestamp DESC);
CREATE INDEX idx_alerts_room_id ON public.alerts(room_id);
CREATE INDEX idx_alerts_acknowledged ON public.alerts(acknowledged);
CREATE INDEX idx_notes_room_id ON public.notes(room_id);
CREATE INDEX idx_cylinder_history_room_id ON public.cylinder_history(room_id);

-- Enable RLS
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sensor_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cylinder_history ENABLE ROW LEVEL SECURITY;

-- Public access policies (no auth for MVP)
CREATE POLICY "Public read access" ON public.rooms FOR SELECT USING (true);
CREATE POLICY "Public insert access" ON public.rooms FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update access" ON public.rooms FOR UPDATE USING (true);
CREATE POLICY "Public delete access" ON public.rooms FOR DELETE USING (true);

CREATE POLICY "Public read access" ON public.sensor_readings FOR SELECT USING (true);
CREATE POLICY "Public insert access" ON public.sensor_readings FOR INSERT WITH CHECK (true);

CREATE POLICY "Public read access" ON public.alerts FOR SELECT USING (true);
CREATE POLICY "Public insert access" ON public.alerts FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update access" ON public.alerts FOR UPDATE USING (true);

CREATE POLICY "Public read access" ON public.notes FOR SELECT USING (true);
CREATE POLICY "Public insert access" ON public.notes FOR INSERT WITH CHECK (true);

CREATE POLICY "Public read access" ON public.cylinder_history FOR SELECT USING (true);
CREATE POLICY "Public insert access" ON public.cylinder_history FOR INSERT WITH CHECK (true);

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.sensor_readings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.alerts;