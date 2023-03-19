export default function initDatabase(): Promise<IDBDatabase> {
  let db: IDBDatabase;

  const dbRequest = window.indexedDB.open("haxball");

  return new Promise((resolve, reject) => {
    dbRequest.onerror = (event) => {
      console.error("dbRequest error", event);
      reject(event.target);
    };
    dbRequest.onupgradeneeded = () => {
      console.info("DB Upgrade needed !");
      const db = dbRequest.result;
      const objectStore = db.createObjectStore("stats", {
        autoIncrement: false,
      });
      objectStore.createIndex("nbGoals", "nbGoals", { unique: false });
      objectStore.createIndex("nbOwnGoals", "nbOwnGoals", { unique: false });
    };
    dbRequest.onsuccess = () => {
      console.info("DB initialized !");
      db = dbRequest.result;
      db.onerror = (event) => {
        console.error(`Database error: ${event.target}`);
      };
      resolve(db);
    };
  });
}
