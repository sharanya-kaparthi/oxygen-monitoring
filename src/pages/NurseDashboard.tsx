import RoomCard from "@/components/RoomCard";
import AlertBanner from "@/components/AlertBanner";
import AlertHistory from "@/components/AlertHistory";
import { useRoomsWithReadings } from "@/hooks/use-icu-data";

export default function NurseDashboard() {
  const { rooms, loading } = useRoomsWithReadings();

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col">
      <AlertBanner />
      <div className="flex-1 p-6">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">Loading...</div>
        ) : rooms.length === 0 ? (
          <div className="flex items-center justify-center py-20 text-center text-muted-foreground">
            No ICU rooms configured yet. Use the admin panel to add rooms.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {rooms.map((room) => (
              <RoomCard key={room.id} room={room} />
            ))}
          </div>
        )}
      </div>
      <AlertHistory />
    </div>
  );
}
