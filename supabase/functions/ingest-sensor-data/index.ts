import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-bridge-api-key",
};

interface SensorPayload {
  device_id: string;
  spo2?: number | null;
  o2_concentration?: number | null;
  temperature?: number | null;
  humidity?: number | null;
  pressure?: number | null;
  cylinder_weight?: number | null;
  timestamp?: string;
}

interface AlertToCreate {
  room_id: string;
  type: string;
  severity: string;
  message: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const readings: SensorPayload[] = Array.isArray(body) ? body : [body];

    if (readings.length === 0) {
      return new Response(JSON.stringify({ error: "No readings provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Look up device_id → room_id mapping
    const deviceIds = [...new Set(readings.filter(r => r.device_id).map(r => r.device_id))];
    const { data: rooms, error: roomErr } = await supabase
      .from("rooms")
      .select("id, device_id, cylinder_expiry_date")
      .in("device_id", deviceIds);

    if (roomErr) throw roomErr;

    const deviceToRoom: Record<string, string> = {};
    const roomExpiry: Record<string, string | null> = {};
    for (const room of rooms || []) {
      deviceToRoom[room.device_id] = room.id;
      roomExpiry[room.id] = room.cylinder_expiry_date;
    }

    // Step 1 — Insert sensor readings (skip unknown devices silently)
    const validReadings = readings.filter(r => r.device_id && deviceToRoom[r.device_id]);
    const insertData = validReadings.map(r => ({
      room_id: deviceToRoom[r.device_id],
      spo2: r.spo2 ?? null,
      o2_concentration: r.o2_concentration ?? null,
      temperature: r.temperature ?? null,
      humidity: r.humidity ?? null,
      pressure: r.pressure ?? null,
      cylinder_weight: r.cylinder_weight ?? null,
      timestamp: r.timestamp || new Date().toISOString(),
    }));

    let insertedCount = 0;
    if (insertData.length > 0) {
      const { error: insertErr } = await supabase.from("sensor_readings").insert(insertData);
      if (insertErr) throw insertErr;
      insertedCount = insertData.length;
    }

    // Fetch existing unacknowledged alerts for affected rooms
    const affectedRoomIds = [...new Set(validReadings.map(r => deviceToRoom[r.device_id]))];
    if (affectedRoomIds.length === 0) {
      return new Response(
        JSON.stringify({ success: true, inserted: 0, alerts_created: 0, alerts_resolved: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: existingAlerts } = await supabase
      .from("alerts")
      .select("id, room_id, type, severity")
      .in("room_id", affectedRoomIds)
      .eq("acknowledged", false);

    const activeAlerts = existingAlerts || [];
    const hasActiveAlert = (roomId: string, type: string) =>
      activeAlerts.some(a => a.room_id === roomId && a.type === type);

    const alertsToCreate: AlertToCreate[] = [];
    const alertTypesToResolve: { roomId: string; type: string }[] = [];

    // Fetch previous readings for spo2_detached detection
    const prevReadingsMap: Record<string, { spo2: number | null }> = {};
    for (const roomId of affectedRoomIds) {
      const { data: prev } = await supabase
        .from("sensor_readings")
        .select("spo2")
        .eq("room_id", roomId)
        .order("timestamp", { ascending: false })
        .range(1, 1); // second most recent (index 1) since we just inserted the latest
      if (prev && prev.length > 0) {
        prevReadingsMap[roomId] = prev[0];
      }
    }

    for (const r of validReadings) {
      const roomId = deviceToRoom[r.device_id];
      const spo2 = r.spo2 ?? null;
      const o2 = r.o2_concentration ?? null;
      const temp = r.temperature ?? null;
      const hum = r.humidity ?? null;
      const weight = r.cylinder_weight ?? null;

      // --- Step 2: Single-sensor alerts ---

      // SpO2 alerts
      if (spo2 != null) {
        if (spo2 < 85) {
          if (!hasActiveAlert(roomId, "low_spo2"))
            alertsToCreate.push({ room_id: roomId, type: "low_spo2", severity: "critical", message: `Emergency: SpO2 critically low at ${spo2}% - life threatening` });
        } else if (spo2 >= 85 && spo2 <= 89) {
          if (!hasActiveAlert(roomId, "low_spo2"))
            alertsToCreate.push({ room_id: roomId, type: "low_spo2", severity: "critical", message: `Critical: SpO2 low at ${spo2}% - immediate intervention needed` });
        } else if (spo2 >= 90 && spo2 <= 94) {
          if (!hasActiveAlert(roomId, "low_spo2"))
            alertsToCreate.push({ room_id: roomId, type: "low_spo2", severity: "warning", message: `Warning: Mild hypoxia, SpO2 at ${spo2}%` });
        } else {
          // SpO2 > 94 → resolve
          alertTypesToResolve.push({ roomId, type: "low_spo2" });
        }
        // Resolve spo2_detached if we have a reading
        alertTypesToResolve.push({ roomId, type: "spo2_detached" });
      } else {
        // spo2 is null — check if previous was not null
        const prev = prevReadingsMap[roomId];
        if (prev && prev.spo2 != null) {
          if (!hasActiveAlert(roomId, "spo2_detached"))
            alertsToCreate.push({ room_id: roomId, type: "spo2_detached", severity: "warning", message: "SpO2 probe may be detached - no reading" });
        }
        // Resolve low_spo2 if spo2 is null (can't measure)
        alertTypesToResolve.push({ roomId, type: "low_spo2" });
      }

      // O2 concentration alerts
      if (o2 != null) {
        if (o2 > 25) {
          if (!hasActiveAlert(roomId, "high_o2"))
            alertsToCreate.push({ room_id: roomId, type: "high_o2", severity: "critical", message: `Critical fire hazard: O2 at ${o2}% - explosion risk` });
        } else if (o2 > 23.5 && o2 <= 25) {
          if (!hasActiveAlert(roomId, "high_o2"))
            alertsToCreate.push({ room_id: roomId, type: "high_o2", severity: "warning", message: `Fire hazard warning: O2 elevated at ${o2}%` });
        } else {
          alertTypesToResolve.push({ roomId, type: "high_o2" });
        }

        if (o2 < 18) {
          if (!hasActiveAlert(roomId, "low_o2"))
            alertsToCreate.push({ room_id: roomId, type: "low_o2", severity: "critical", message: `Critical: Room oxygen depleted at ${o2}% - unsafe for staff` });
        } else if (o2 >= 18 && o2 < 19.5) {
          if (!hasActiveAlert(roomId, "low_o2"))
            alertsToCreate.push({ room_id: roomId, type: "low_o2", severity: "warning", message: `Room oxygen depletion warning: O2 at ${o2}%` });
        } else {
          alertTypesToResolve.push({ roomId, type: "low_o2" });
        }
      }

      // Cylinder weight alerts
      if (weight != null) {
        if (weight < 500) {
          if (!hasActiveAlert(roomId, "low_weight"))
            alertsToCreate.push({ room_id: roomId, type: "low_weight", severity: "critical", message: `Critical: Cylinder nearly empty at ${weight}g` });
        } else if (weight >= 500 && weight <= 1500) {
          if (!hasActiveAlert(roomId, "low_weight"))
            alertsToCreate.push({ room_id: roomId, type: "low_weight", severity: "warning", message: `Low cylinder supply: ${weight}g remaining` });
        } else {
          alertTypesToResolve.push({ roomId, type: "low_weight" });
        }
      }

      // Temperature alerts
      if (temp != null) {
        if (temp > 50) {
          if (!hasActiveAlert(roomId, "high_temp"))
            alertsToCreate.push({ room_id: roomId, type: "high_temp", severity: "critical", message: `Critical: Temperature ${temp}°C dangerous near oxygen cylinders` });
        } else if (temp >= 40 && temp <= 50) {
          if (!hasActiveAlert(roomId, "high_temp"))
            alertsToCreate.push({ room_id: roomId, type: "high_temp", severity: "warning", message: `Warning: Temperature ${temp}°C elevated near oxygen cylinders` });
        } else {
          alertTypesToResolve.push({ roomId, type: "high_temp" });
        }
      }

      // Humidity alerts
      if (hum != null) {
        if (hum > 70) {
          if (!hasActiveAlert(roomId, "high_humidity"))
            alertsToCreate.push({ room_id: roomId, type: "high_humidity", severity: "warning", message: `High humidity at ${hum}% - equipment corrosion risk` });
        } else {
          alertTypesToResolve.push({ roomId, type: "high_humidity" });
        }

        if (hum < 20) {
          if (!hasActiveAlert(roomId, "low_humidity"))
            alertsToCreate.push({ room_id: roomId, type: "low_humidity", severity: "warning", message: `Low humidity at ${hum}% - static electricity risk near oxygen` });
        } else {
          alertTypesToResolve.push({ roomId, type: "low_humidity" });
        }
      }

      // --- Step 3: Cross-sensor combined alerts ---
      if (spo2 != null && o2 != null) {
        if (spo2 < 94 && o2 >= 19.5 && o2 <= 23.5) {
          if (!hasActiveAlert(roomId, "delivery_problem"))
            alertsToCreate.push({ room_id: roomId, type: "delivery_problem", severity: "warning", message: "SpO2 low but room O2 normal - check mask and tubing" });
        } else {
          alertTypesToResolve.push({ roomId, type: "delivery_problem" });
        }

        if (spo2 < 94 && o2 < 19.5) {
          if (!hasActiveAlert(roomId, "supply_problem"))
            alertsToCreate.push({ room_id: roomId, type: "supply_problem", severity: "critical", message: "SpO2 and room O2 both low - oxygen not reaching room" });
        } else {
          alertTypesToResolve.push({ roomId, type: "supply_problem" });
        }
      }

      if (o2 != null && temp != null) {
        if (o2 > 23.5 && temp > 35) {
          if (!hasActiveAlert(roomId, "fire_risk"))
            alertsToCreate.push({ room_id: roomId, type: "fire_risk", severity: "critical", message: `Fire risk: Elevated O2 at ${o2}% and temperature at ${temp}°C` });
        } else {
          alertTypesToResolve.push({ roomId, type: "fire_risk" });
        }
      }

      // Fire hazard (existing logic)
      if (o2 != null && hum != null) {
        if (o2 > 23.5 && hum >= 60) {
          const severity = (o2 > 25 || hum > 75) ? "critical" : "warning";
          if (!hasActiveAlert(roomId, "fire_hazard"))
            alertsToCreate.push({ room_id: roomId, type: "fire_hazard", severity, message: `Fire hazard risk: O2 at ${o2}%, Humidity at ${hum}%` });
        } else {
          alertTypesToResolve.push({ roomId, type: "fire_hazard" });
        }
      }

      // --- Step 4: Cylinder expiry alerts ---
      const expiryDate = roomExpiry[roomId];
      if (expiryDate) {
        const now = new Date();
        const expiry = new Date(expiryDate);
        const diffMs = expiry.getTime() - now.getTime();
        const daysUntil = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

        if (daysUntil < 0) {
          if (!hasActiveAlert(roomId, "expiry_warning"))
            alertsToCreate.push({ room_id: roomId, type: "expiry_warning", severity: "critical", message: `Cylinder expired ${Math.abs(daysUntil)} days ago - do not use` });
        } else if (daysUntil < 7) {
          if (!hasActiveAlert(roomId, "expiry_warning"))
            alertsToCreate.push({ room_id: roomId, type: "expiry_warning", severity: "critical", message: `Cylinder expires in ${daysUntil} days` });
        } else if (daysUntil <= 30) {
          if (!hasActiveAlert(roomId, "expiry_warning"))
            alertsToCreate.push({ room_id: roomId, type: "expiry_warning", severity: "warning", message: `Cylinder expires in ${daysUntil} days` });
        } else {
          alertTypesToResolve.push({ roomId, type: "expiry_warning" });
        }
      }
    }

    // --- Insert new alerts ---
    let alertsCreated = 0;
    if (alertsToCreate.length > 0) {
      const { error: alertErr } = await supabase.from("alerts").insert(alertsToCreate);
      if (alertErr) console.error("Alert insert error:", alertErr);
      else alertsCreated = alertsToCreate.length;
    }

    // --- Step 5: Auto-resolve alerts ---
    let alertsResolved = 0;
    // Deduplicate resolve requests
    const resolveSet = new Set(alertTypesToResolve.map(r => `${r.roomId}|${r.type}`));
    for (const key of resolveSet) {
      const [roomId, type] = key.split("|");
      // Don't resolve if we're also creating an alert of the same type
      if (alertsToCreate.some(a => a.room_id === roomId && a.type === type)) continue;

      const { data: resolved } = await supabase
        .from("alerts")
        .update({ acknowledged: true, acknowledged_at: new Date().toISOString() })
        .eq("room_id", roomId)
        .eq("type", type)
        .eq("acknowledged", false)
        .select("id");

      if (resolved) alertsResolved += resolved.length;
    }

    return new Response(
      JSON.stringify({ success: true, inserted: insertedCount, alerts_created: alertsCreated, alerts_resolved: alertsResolved }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Ingest error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
