import { openDB } from "idb";

// Initialize IndexedDB
const DB_NAME = "FaceRecognitionDB";
const STORE_NAME = "Faces";

// Open database
export async function initDB() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, {
          keyPath: "id",
          autoIncrement: true,
        });
      }
    },
  });
}

// Store face descriptors in IndexedDB
export async function storeFaceDescriptor(descriptor) {
  const db = await initDB();
  return db.put(STORE_NAME, { descriptor });
}

// Retrieve all stored face descriptors
export async function getStoredDescriptors() {
  const db = await initDB();
  return db.getAll(STORE_NAME);
}

export async function getAllStoredData() {
  const db = await initDB();
  const data = await db.getAll(STORE_NAME);
  console.log("IndexedDB Data:", data);
}
