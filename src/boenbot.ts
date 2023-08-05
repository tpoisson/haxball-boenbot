import HaxballRoom from "./room/HaxballRoom";

declare global {
  interface Window {
    room: HaxballRoom;
  }
}

const room = new HaxballRoom();
window.room = room; // Make it reachable in the developer console
console.info(`Room created ! ${room}`);
