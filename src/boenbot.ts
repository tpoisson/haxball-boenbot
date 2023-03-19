import initDatabase from "./db/IndexedBD";
import HaxballRoom from "./room/HaxballRoom";

let room: HaxballRoom; // Make it reachable in the developer console

initDatabase()
  .then((db) => {
    room = new HaxballRoom(db);
    console.info(`Room created ! ${room}`);
  })
  .catch((error) => {
    console.error(`${error}`);
  });
