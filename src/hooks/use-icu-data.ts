import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Room, SensorReading, Alert, RoomWithLatestReading } from "@/lib/types";

let channelCounter = 0;
function uniqueChannel(prefix: string) {
  return `${prefix}_${++channelCounter}_${Date.now()}`;
}

export function useRooms() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRooms = async () => {
    const { data } = await supabase.from("rooms").select("*").order("name");
    if (data) setRooms(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchRooms();
  }, []);

  return { rooms, loading, refetch: fetchRooms };
}

export function useLatestReadings(roomIds: string[]) {
  const [readings, setReadings] = useState<Record<string, SensorReading>>({});

  const fetchReadings = async () => {
    if (roomIds.length === 0) return;
    // Get latest reading per room using distinct on
    const { data } = await supabase
      .from("sensor_readings")
      .select("*")
      .in("room_id", roomIds)
      .order("timestamp", { ascending: false });

    if (data) {
      const latest: Record<string, SensorReading> = {};
      for (const reading of data) {
        if (!latest[reading.room_id]) {
          latest[reading.room_id] = reading;
        }
      }
      setReadings(latest);
    }
  };

  useEffect(() => {
    fetchReadings();
  }, [roomIds.join(",")]);

  // Subscribe to realtime updates
  useEffect(() => {
    const channel = supabase
      .channel(uniqueChannel("sensor_readings"))
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "sensor_readings" },
        (payload) => {
          const newReading = payload.new as SensorReading;
          setReadings((prev) => ({
            ...prev,
            [newReading.room_id]: newReading,
          }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return readings;
}

export function useAlerts(acknowledged?: boolean) {
  const [alerts, setAlerts] = useState<Alert[]>([]);

  const fetchAlerts = async () => {
    let query = supabase.from("alerts").select("*").order("created_at", { ascending: false });
    if (acknowledged !== undefined) {
      query = query.eq("acknowledged", acknowledged);
    }
    const { data } = await query.limit(50);
    if (data) setAlerts(data);
  };

  useEffect(() => {
    fetchAlerts();
  }, [acknowledged]);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel(uniqueChannel("alerts"))
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "alerts" },
        () => {
          fetchAlerts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [acknowledged]);

  return { alerts, refetch: fetchAlerts };
}

export function useRoomReadings(roomId: string) {
  const [readings, setReadings] = useState<SensorReading[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from("sensor_readings")
        .select("*")
        .eq("room_id", roomId)
        .gte("timestamp", since)
        .order("timestamp", { ascending: true });
      if (data) setReadings(data);
      setLoading(false);
    };
    fetch();

    const channel = supabase
      .channel(uniqueChannel(`room_readings_${roomId}`))
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "sensor_readings",
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          setReadings((prev) => [...prev, payload.new as SensorReading]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  return { readings, loading };
}

export function useRoomsWithReadings(): { rooms: RoomWithLatestReading[]; loading: boolean } {
  const { rooms, loading: roomsLoading } = useRooms();
  const roomIds = rooms.map((r) => r.id);
  const readings = useLatestReadings(roomIds);

  const roomsWithReadings: RoomWithLatestReading[] = rooms.map((room) => ({
    ...room,
    latestReading: readings[room.id] || null,
  }));

  return { rooms: roomsWithReadings, loading: roomsLoading };
}

export async function acknowledgeAlert(alertId: string) {
  await supabase
    .from("alerts")
    .update({ acknowledged: true, acknowledged_at: new Date().toISOString() })
    .eq("id", alertId);
}

export async function deleteAlert(alertId: string) {
  await supabase.from("alerts").delete().eq("id", alertId);
}

export async function clearAlertHistory() {
  await supabase.from("alerts").delete().eq("acknowledged", true);
}
