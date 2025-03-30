import { initializeApp } from "firebase/app";
import * as faceapi from "@vladmandic/face-api";
import path from "path";

let firebaseInitialized = false;

export function initializeFirebase() {
  if (firebaseInitialized) return;

  const firebaseConfig = {
    apiKey: process.env.VITE_FIREBASE_API_KEY,
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.VITE_MESSAGING_SENDER_ID,
    appId: process.env.VITE_FIREBASE_APP_ID,
  };

  initializeApp(firebaseConfig);
  firebaseInitialized = true;
}

export async function loadFaceApiModels() {
  const modelPath = path.join(process.cwd(), "models");
  await faceapi.nets.ssdMobilenetv1.loadFromDisk(modelPath);
  await faceapi.nets.faceLandmark68Net.loadFromDisk(modelPath);
  await faceapi.nets.faceRecognitionNet.loadFromDisk(modelPath);
}
