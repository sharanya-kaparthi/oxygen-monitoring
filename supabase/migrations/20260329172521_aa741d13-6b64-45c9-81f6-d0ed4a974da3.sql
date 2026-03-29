-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ─── FUNCTION 1: Trending Alerts (runs every 1 minute) ───────────────────────
CREATE OR REPLACE FUNCTION check_trending_alerts()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r RECORD;
  older_spo2 NUMERIC;
  newer_spo2 NUMERIC;
  older_temp NUMERIC;
  newer_temp NUMERIC;
  spo2_drop NUMERIC;
  temp_rise NUMERIC;
  mid_time TIMESTAMPTZ;
  window_start TIMESTAMPTZ;
BEGIN
  window_start := now() - INTERVAL '10 minutes';
  mid_time := now() - INTERVAL '5 minutes';

  FOR r IN SELECT id FROM public.rooms LOOP
    SELECT AVG(spo2) INTO older_spo2
    FROM public.sensor_readings
    WHERE room_id = r.id AND timestamp >= window_start AND timestamp < mid_time AND spo2 IS NOT NULL;

    SELECT AVG(spo2) INTO newer_spo2
    FROM public.sensor_readings
    WHERE room_id = r.id AND timestamp >= mid_time AND spo2 IS NOT NULL;

    IF older_spo2 IS NOT NULL AND newer_spo2 IS NOT NULL THEN
      spo2_drop := older_spo2 - newer_spo2;
      IF spo2_drop >= 3 THEN
        IF NOT EXISTS (SELECT 1 FROM public.alerts WHERE room_id = r.id AND type = 'spo2_trending_down' AND acknowledged = false) THEN
          INSERT INTO public.alerts (room_id, type, severity, message)
          VALUES (r.id, 'spo2_trending_down', 'warning',
            'SpO2 trending down: dropped ' || ROUND(spo2_drop, 1) || '% over last 10 minutes - monitor closely');
        END IF;
      ELSE
        UPDATE public.alerts SET acknowledged = true, acknowledged_at = now()
        WHERE room_id = r.id AND type = 'spo2_trending_down' AND acknowledged = false;
      END IF;
    END IF;

    SELECT AVG(temperature) INTO older_temp
    FROM public.sensor_readings
    WHERE room_id = r.id AND timestamp >= window_start AND timestamp < mid_time AND temperature IS NOT NULL;

    SELECT AVG(temperature) INTO newer_temp
    FROM public.sensor_readings
    WHERE room_id = r.id AND timestamp >= mid_time AND temperature IS NOT NULL;

    IF older_temp IS NOT NULL AND newer_temp IS NOT NULL THEN
      temp_rise := newer_temp - older_temp;
      IF temp_rise >= 2 THEN
        IF NOT EXISTS (SELECT 1 FROM public.alerts WHERE room_id = r.id AND type = 'temp_trending_up' AND acknowledged = false) THEN
          INSERT INTO public.alerts (room_id, type, severity, message)
          VALUES (r.id, 'temp_trending_up', 'warning',
            'Temperature trending up: rose ' || ROUND(temp_rise, 1) || '°C over last 10 minutes');
        END IF;
      ELSE
        UPDATE public.alerts SET acknowledged = true, acknowledged_at = now()
        WHERE room_id = r.id AND type = 'temp_trending_up' AND acknowledged = false;
      END IF;
    END IF;
  END LOOP;
END;
$$;

-- ─── FUNCTION 2: Valve Closed Check (runs every 5 minutes) ──────────────────
CREATE OR REPLACE FUNCTION check_valve_closed()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r RECORD;
  weight_max NUMERIC;
  weight_min NUMERIC;
  latest_spo2 NUMERIC;
BEGIN
  FOR r IN SELECT id FROM public.rooms LOOP
    SELECT MAX(cylinder_weight), MIN(cylinder_weight) INTO weight_max, weight_min
    FROM public.sensor_readings
    WHERE room_id = r.id AND timestamp >= now() - INTERVAL '30 minutes' AND cylinder_weight IS NOT NULL;

    SELECT spo2 INTO latest_spo2
    FROM public.sensor_readings
    WHERE room_id = r.id AND spo2 IS NOT NULL
    ORDER BY timestamp DESC LIMIT 1;

    IF weight_max IS NOT NULL AND weight_min IS NOT NULL THEN
      IF (weight_max - weight_min) < 10 AND latest_spo2 < 94 THEN
        IF NOT EXISTS (SELECT 1 FROM public.alerts WHERE room_id = r.id AND type = 'valve_closed' AND acknowledged = false) THEN
          INSERT INTO public.alerts (room_id, type, severity, message)
          VALUES (r.id, 'valve_closed', 'warning',
            'Possible valve closed: cylinder weight unchanged for 30 minutes but SpO2 is low - check oxygen flow');
        END IF;
      ELSE
        UPDATE public.alerts SET acknowledged = true, acknowledged_at = now()
        WHERE room_id = r.id AND type = 'valve_closed' AND acknowledged = false;
      END IF;
    END IF;
  END LOOP;
END;
$$;

-- ─── FUNCTION 3: Abnormal Consumption Check (runs every 5 minutes) ──────────
CREATE OR REPLACE FUNCTION check_abnormal_consumption()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r RECORD;
  weight_now NUMERIC;
  weight_10min_ago NUMERIC;
  weight_drop NUMERIC;
BEGIN
  FOR r IN SELECT id FROM public.rooms LOOP
    SELECT cylinder_weight INTO weight_now
    FROM public.sensor_readings
    WHERE room_id = r.id AND cylinder_weight IS NOT NULL
    ORDER BY timestamp DESC LIMIT 1;

    SELECT cylinder_weight INTO weight_10min_ago
    FROM public.sensor_readings
    WHERE room_id = r.id AND timestamp <= now() - INTERVAL '10 minutes' AND cylinder_weight IS NOT NULL
    ORDER BY timestamp DESC LIMIT 1;

    IF weight_now IS NOT NULL AND weight_10min_ago IS NOT NULL THEN
      weight_drop := weight_10min_ago - weight_now;
      IF weight_drop > 80 THEN
        IF NOT EXISTS (SELECT 1 FROM public.alerts WHERE room_id = r.id AND type = 'abnormal_consumption' AND acknowledged = false) THEN
          INSERT INTO public.alerts (room_id, type, severity, message)
          VALUES (r.id, 'abnormal_consumption', 'warning',
            'Abnormal cylinder consumption: lost ' || ROUND(weight_drop) || 'g in 10 minutes - check flow rate or possible leak');
        END IF;
      ELSE
        UPDATE public.alerts SET acknowledged = true, acknowledged_at = now()
        WHERE room_id = r.id AND type = 'abnormal_consumption' AND acknowledged = false;
      END IF;
    END IF;
  END LOOP;
END;
$$;

-- ─── FUNCTION 4: Device Offline Check (runs every 1 minute) ─────────────────
CREATE OR REPLACE FUNCTION check_device_offline()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r RECORD;
  latest_reading TIMESTAMPTZ;
  seconds_silent NUMERIC;
BEGIN
  FOR r IN SELECT id, name FROM public.rooms LOOP
    SELECT timestamp INTO latest_reading
    FROM public.sensor_readings
    WHERE room_id = r.id
    ORDER BY timestamp DESC LIMIT 1;

    IF latest_reading IS NULL THEN
      seconds_silent := 999;
    ELSE
      seconds_silent := EXTRACT(EPOCH FROM (now() - latest_reading));
    END IF;

    IF seconds_silent > 30 THEN
      IF NOT EXISTS (SELECT 1 FROM public.alerts WHERE room_id = r.id AND type = 'device_offline' AND acknowledged = false) THEN
        INSERT INTO public.alerts (room_id, type, severity, message)
        VALUES (r.id, 'device_offline', 'warning',
          'Device offline: no data received from ESP32 for ' || ROUND(seconds_silent) || ' seconds');
      END IF;
    ELSE
      UPDATE public.alerts SET acknowledged = true, acknowledged_at = now()
      WHERE room_id = r.id AND type = 'device_offline' AND acknowledged = false;
    END IF;
  END LOOP;
END;
$$;

-- ─── Schedule all jobs with pg_cron ─────────────────────────────────────────
SELECT cron.schedule('check-trending-alerts',      '* * * * *',   'SELECT check_trending_alerts()');
SELECT cron.schedule('check-valve-closed',         '*/5 * * * *', 'SELECT check_valve_closed()');
SELECT cron.schedule('check-abnormal-consumption', '*/5 * * * *', 'SELECT check_abnormal_consumption()');
SELECT cron.schedule('check-device-offline',       '* * * * *',   'SELECT check_device_offline()');