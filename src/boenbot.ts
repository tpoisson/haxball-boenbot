import initDatabase from "./db/IndexedBD";
import HaxballRoom from "./room/HaxballRoom";

declare global {
  interface Window {
    room: HaxballRoom;
  }
}

initDatabase()
  .then((db) => {
    const room = new HaxballRoom(db);
    window.room = room; // Make it reachable in the developer console
    console.info(`Room created ! ${room}`);
  })
  .catch((error) => {
    console.error(`${error}`);
  });
