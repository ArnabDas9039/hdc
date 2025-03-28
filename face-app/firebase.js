import { initializeApp } from "firebase/app";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyD-vHwwOIHYOUYuLe2LvDHtFTRsO412bXA",
  authDomain: "face-app-e86e5.firebaseapp.com",
  projectId: "face-app-e86e5",
  storageBucket: "face-app-e86e5.firebasestorage.app",
  messagingSenderId: "438944703683",
  appId: "1:438944703683:web:9675f4ec25d535930fee76",
  measurementId: "G-9R8STGLCXM",
};

const app = initializeApp(firebaseConfig);
export const storage = getStorage(app);
