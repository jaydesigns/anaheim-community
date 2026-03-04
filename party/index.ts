import type * as Party from "partykit/server";

type Participant = {
  id: string;
  lng: number;
  lat: number;
  color: string;
  icon: PresenceIcon;
};

type PresenceIcon = "mouse" | "person" | "boy" | "girl";

type PositionMessage = {
  type: "position";
  lng: number;
  lat: number;
  icon?: PresenceIcon;
};

const userColors = ["#f44336", "#3f51b5", "#4caf50", "#ff9800", "#9c27b0", "#00acc1", "#8bc34a"];
const allowedIcons: PresenceIcon[] = ["mouse", "person", "boy", "girl"];

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const colorForId = (id: string) => {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) | 0;
  }

  return userColors[Math.abs(hash) % userColors.length];
};

export default class Server implements Party.Server {
  participants = new Map<string, Participant>();

  constructor(readonly room: Party.Room) {}

  private broadcastPresence(selfId: string | null = null) {
    const payload = JSON.stringify({
      type: "presence",
      selfId,
      participants: Array.from(this.participants.values())
    });

    this.room.broadcast(payload);
  }

  onConnect(conn: Party.Connection, _ctx: Party.ConnectionContext) {
    const existing = this.participants.get(conn.id);

    if (!existing) {
      this.participants.set(conn.id, {
        id: conn.id,
        lng: -117.9143,
        lat: 33.8353,
        color: colorForId(conn.id),
        icon: "person"
      });
    }

    conn.send(
      JSON.stringify({
        type: "presence",
        selfId: conn.id,
        participants: Array.from(this.participants.values())
      })
    );

    this.broadcastPresence();
  }

  onMessage(message: string, sender: Party.Connection) {
    let payload: PositionMessage | null = null;

    try {
      payload = JSON.parse(message) as PositionMessage;
    } catch {
      return;
    }

    if (payload?.type !== "position") {
      return;
    }

    if (!Number.isFinite(payload.lng) || !Number.isFinite(payload.lat)) {
      return;
    }

    this.participants.set(sender.id, {
      id: sender.id,
      color: colorForId(sender.id),
      lng: clamp(payload.lng, -180, 180),
      lat: clamp(payload.lat, -85, 85),
      icon: allowedIcons.includes(payload.icon as PresenceIcon)
        ? (payload.icon as PresenceIcon)
        : this.participants.get(sender.id)?.icon || "person"
    });

    this.broadcastPresence();
  }

  onClose(conn: Party.Connection) {
    this.participants.delete(conn.id);
    this.broadcastPresence();
  }
}

Server satisfies Party.Worker;
