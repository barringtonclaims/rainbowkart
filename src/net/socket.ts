import { io, Socket } from 'socket.io-client';

export type RoomPlayer = { id: string; name: string; color: number; ready: boolean };
export type RoomState = { code: string; started: boolean; hostId: string; players: RoomPlayer[] };

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(import.meta.env.VITE_WS_URL || 'http://localhost:3001');
  }
  return socket;
}


