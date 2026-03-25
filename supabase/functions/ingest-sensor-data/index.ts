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

function getFireHazardSeverity(
  o2: number | null | undefined,
  humidity: number | null | undefined
): "warning" | "critical" | null {
  if (o2 == null || humidity == null) return null;
  if (o2 <= 23.5 || humidity < 60) return null;
  if (o2 > 25) return "critical";
  if (humidity > 75) return "critical";
  return "warning";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Accept single reading or batch
    const body = await req.json();
    const readings: SensorPayload[] = Array.isArray(body) ? body : [body];

    if (readings.length === 0) {
      return new Response(JSON.stringify({ error: "No readings provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate each reading has a device_id
    for (const r of readings) {
      if (!r.device_id) {
        return new Response(
          JSON.stringify({ error: "Each reading must have a device_id" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Look up device_id → room_id mapping
    const deviceIds = [...new Set(readings.map((r) => r.device_id))];
    const { data: rooms, error: roomErr } = await supabase
      .from("rooms")
      .select("id, device_id")
      .in("device_id", deviceIds);

    if (roomErr) throw roomErr;

    const deviceToRoom: Record<string, string> = {};
    for (const room of rooms || []) {
      deviceToRoom[room.device_id] = room.id;
    }

    // Check for unknown devices
    const unknownDevices = deviceIds.filter((d) => !deviceToRoom[d]);
    if (unknownDevices.length > 0) {
      return new Response(
        JSON.stringify({
          error: `Unknown device_id(s): ${unknownDevices.join(", ")}`,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Insert sensor readings
    const insertData = readings.map((r) => ({
      room_id: deviceToRoom[r.device_id],
      spo2: r.spo2 ?? null,
      o2_concentration: r.o2_concentration ?? null,
      temperature: r.temperature ?? null,
      humidity: r.humidity ?? null,
      pressure: r.pressure ?? null,
      cylinder_weight: r.cylinder_weight ?? null,
      timestamp: r.timestamp || new Date().toISOString(),
    }));

    const { error: insertErr } = await supabase
      .from("sensor_readings")
      .insert(insertData);

    if (insertErr) throw insertErr;

    // Fire hazard alert logic
    for (const r of readings) {
      const roomId = deviceToRoom[r.device_id];
      const severity = getFireHazardSeverity(r.o2_concentration, r.humidity);

      if (severity) {
        // Check for existing active fire_hazard alert for this room
        const { data: existingAlerts } = await supabase
          .from("alerts")
          .select("id, severity")
          .eq("room_id", roomId)
          .eq("type", "fire_hazard")
          .eq("acknowledged", false)
          .limit(1);

        const existing = existingAlerts?.[0];

        if (!existing) {
          // Create new fire hazard alert
          await supabase.from("alerts").insert({
            room_id: roomId,
            type: "fire_hazard",
            severity,
            message: `Fire hazard risk: O2 at ${r.o2_concentration}%, Humidity at ${r.humidity}%`,
          });
        } else if (existing.severity !== severity) {
          // Update severity if changed
          await supabase
            .from("alerts")
            .update({
              severity,
              message: `Fire hazard risk: O2 at ${r.o2_concentration}%, Humidity at ${r.humidity}%`,
            })
            .eq("id", existing.id);
        }
      } else {
        // Auto-resolve: acknowledge any active fire_hazard alerts for this room
        await supabase
          .from("alerts")
          .update({
            acknowledged: true,
            acknowledged_at: new Date().toISOString(),
          })
          .eq("room_id", roomId)
          .eq("type", "fire_hazard")
          .eq("acknowledged", false);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        inserted: readings.length,
      }),
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
