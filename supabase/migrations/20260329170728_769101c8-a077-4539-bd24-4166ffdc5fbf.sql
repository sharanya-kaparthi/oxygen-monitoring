-- Step 1: Enable extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Step 2: check_trending_alerts() — runs every 1 minute
CREATE OR REPLACE FUNCTION check_trending_alerts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  older_avg_spo2 numeric;
  newer_avg_spo2 numeric;
  spo2_drop numeric;
  older_avg_temp numeric;
  newer_avg_temp numeric;
  temp_rise numeric;
  cutoff timestamptz;
  midpoint timestamptz;
  has_alert boolean;
BEGIN
  cutoff := now() - interval '10 minutes';
  midpoint := now() - interval '5 minutes';

  FOR r IN SELECT id FROM rooms LOOP
    SELECT avg(spo2) INTO older_avg_spo2
    FROM sensor_readings
    WHERE room_id = r.id AND timestamp >= cutoff AND timestamp < midpoint AND spo2 IS NOT NULL;

    SELECT avg(spo2) INTO newer_avg_spo2
    FROM sensor_readings
    WHERE room_id = r.id AND timestamp >= midpoint AND spo2 IS NOT NULL;

    IF older_avg_spo2 IS NOT NULL AND newer_avg_spo2 IS NOT NULL THEN
      spo2_drop := older_avg_spo2 - newer_avg_spo2;
      IF spo2_drop > 3 THEN
        SELECT EXISTS(
          SELECT 1 FROM alerts WHERE room_id = r.id AND type = 'spo2_trending_down' AND acknowledged = false
        ) INTO has_alert;
        IF NOT has_alert THEN
          INSERT INTO alerts (room_id, type, severity, message)
          VALUES (r.id, 'spo2_trending_down', 'warning',
            'SpO2 trending down: dropped ' || round(spo2_drop, 1) || '% over last 10 minutes - monitor closely');
        END IF;
      ELSE
        UPDATE alerts SET acknowledged = true, acknowledged_at = now()
        WHERE room_id = r.id AND type = 'spo2_trending_down' AND acknowledged = false;
      END IF;
    END IF;

    SELECT avg(temperature) INTO older_avg_temp
    FROM sensor_readings
    WHERE room_id = r.id AND timestamp >= cutoff AND timestamp < midpoint AND temperature IS NOT NULL;

    SELECT avg(temperature) INTO newer_avg_temp
    FROM sensor_readings
    WHERE room_id = r.id AND timestamp >= midpoint AND temperature IS NOT NULL;

    IF older_avg_temp IS NOT NULL AND newer_avg_temp IS NOT NULL THEN
      temp_rise := newer_avg_temp - older_avg_temp;
      IF temp_rise > 2 THEN
        SELECT EXISTS(
          SELECT 1 FROM alerts WHERE room_id = r.id AND type = 'temp_trending_up' AND acknowledged = false
        ) INTO has_alert;
        IF NOT has_alert THEN
          INSERT INTO alerts (room_id, type, severity, message)
          VALUES (r.id, 'temp_trending_up', 'warning',
            'Temperature trending up: rose ' || round(temp_rise, 1) || '°C over last 10 minutes');
        END IF;
      ELSE
        UPDATE alerts SET acknowledged = true, acknowledged_at = now()
        WHERE room_id = r.id AND type = 'temp_trending_up' AND acknowledged = false;
      END IF;
    END IF;
  END LOOP;
END;
$$;

-- Step 3: check_valve_closed() — runs every 5 minutes
CREATE OR REPLACE FUNCTION check_valve_closed()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  weight_max numeric;
  weight_min numeric;
  weight_diff numeric;
  latest_spo2 numeric;
  has_alert boolean;
BEGIN
  FOR r IN SELECT id FROM rooms LOOP
    SELECT max(cylinder_weight), min(cylinder_weight)
    INTO weight_max, weight_min
    FROM sensor_readings
    WHERE room_id = r.id AND timestamp >= now() - interval '30 minutes' AND cylinder_weight IS NOT NULL;

    IF weight_max IS NOT NULL AND weight_min IS NOT NULL THEN
      weight_diff := weight_max - weight_min;

      SELECT spo2 INTO latest_spo2
      FROM sensor_readings
      WHERE room_id = r.id AND spo2 IS NOT NULL
      ORDER BY timestamp DESC LIMIT 1;

      IF weight_diff < 5 AND latest_spo2 IS NOT NULL AND latest_spo2 < 94 THEN
        SELECT EXISTS(
          SELECT 1 FROM alerts WHERE room_id = r.id AND type = 'valve_closed' AND acknowledged = false
        ) INTO has_alert;
        IF NOT has_alert THEN
          INSERT INTO alerts (room_id, type, severity, message)
          VALUES (r.id, 'valve_closed', 'warning',
            'Possible valve closed: cylinder weight unchanged for 30 minutes but SpO2 is low - check oxygen flow');
        END IF;
      ELSE
        UPDATE alerts SET acknowledged = true, acknowledged_at = now()
        WHERE room_id = r.id AND type = 'valve_closed' AND acknowledged = false;
      END IF;
    END IF;
  END LOOP;
END;
$$;

-- Step 4: check_abnormal_consumption() — runs every 5 minutes
CREATE OR REPLACE FUNCTION check_abnormal_consumption()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  old_weight numeric;
  new_weight numeric;
  weight_drop numeric;
  has_alert boolean;
BEGIN
  FOR r IN SELECT id FROM rooms LOOP
    SELECT cylinder_weight INTO old_weight
    FROM sensor_readings
    WHERE room_id = r.id AND cylinder_weight IS NOT NULL
      AND timestamp <= now() - interval '9 minutes'
    ORDER BY timestamp DESC LIMIT 1;

    SELECT cylinder_weight INTO new_weight
    FROM sensor_readings
    WHERE room_id = r.id AND cylinder_weight IS NOT NULL
    ORDER BY timestamp DESC LIMIT 1;

    IF old_weight IS NOT NULL AND new_weight IS NOT NULL THEN
      weight_drop := old_weight - new_weight;
      IF weight_drop > 50 THEN
        SELECT EXISTS(
          SELECT 1 FROM alerts WHERE room_id = r.id AND type = 'abnormal_consumption' AND acknowledged = false
        ) INTO has_alert;
        IF NOT has_alert THEN
          INSERT INTO alerts (room_id, type, severity, message)
          VALUES (r.id, 'abnormal_consumption', 'warning',
            'Abnormal cylinder consumption: lost ' || round(weight_drop, 0) || 'g in 10 minutes - check flow rate or possible leak');
        END IF;
      ELSE
        UPDATE alerts SET acknowledged = true, acknowledged_at = now()
        WHERE room_id = r.id AND type = 'abnormal_consumption' AND acknowledged = false;
      END IF;
    END IF;
  END LOOP;
END;
$$;

-- Step 5: check_device_offline() — runs every 1 minute
CREATE OR REPLACE FUNCTION check_device_offline()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  last_ts timestamptz;
  seconds_ago numeric;
  has_alert boolean;
BEGIN
  FOR r IN SELECT id FROM rooms LOOP
    SELECT max(timestamp) INTO last_ts
    FROM sensor_readings
    WHERE room_id = r.id;

    IF last_ts IS NOT NULL THEN
      seconds_ago := extract(epoch FROM (now() - last_ts));

      IF seconds_ago > 30 THEN
        SELECT EXISTS(
          SELECT 1 FROM alerts WHERE room_id = r.id AND type = 'device_offline' AND acknowledged = false
        ) INTO has_alert;
        IF NOT has_alert THEN
          INSERT INTO alerts (room_id, type, severity, message)
          VALUES (r.id, 'device_offline', 'warning',
            'Device offline: no data received from ESP32 for ' || round(seconds_ago, 0) || ' seconds');
        END IF;
      ELSE
        UPDATE alerts SET acknowledged = true, acknowledged_at = now()
        WHERE room_id = r.id AND type = 'device_offline' AND acknowledged = false;
      END IF;
    END IF;
  END LOOP;
END;
$$;

-- Step 6: Schedule all functions with pg_cron
SELECT cron.schedule('check-trending-alerts', '* * * * *', 'SELECT check_trending_alerts()');
SELECT cron.schedule('check-valve-closed', '*/5 * * * *', 'SELECT check_valve_closed()');
SELECT cron.schedule('check-abnormal-consumption', '*/5 * * * *', 'SELECT check_abnormal_consumption()');
SELECT cron.schedule('check-device-offline', '* * * * *', 'SELECT check_device_offline()');