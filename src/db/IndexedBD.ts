export abstract class IndexedBDDAO<T> {
  private readonly db: IDBDatabase;
  private readonly storeName: string;

  constructor(db: IDBDatabase, storeName: string) {
    this.db = db;
    this.storeName = storeName;
  }

  private getTransaction(mode: IDBTransactionMode = "readonly") {
    return this.db.transaction(this.storeName, mode).objectStore(this.storeName);
  }

  public get(key: IDBValidKey): Promise<T | undefined> {
    const request = this.getTransaction().get(key);
    return this.execRequest(request);
  }

  public getAll(): Promise<T[] | undefined> {
    const request = this.getTransaction().getAll();
    return this.execRequest(request);
  }

  public put(value: T, key?: IDBValidKey): Promise<IDBValidKey> {
    const request = this.getTransaction("readwrite").put(value, key);
    return this.execRequest(request);
  }

  protected execRequest<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = (ev) => {
        resolve(request.result);
      };
      request.onerror = (ev) => {
        reject(request.error);
      };
    });
  }
}
