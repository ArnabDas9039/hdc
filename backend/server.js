import express from "express";
import nodemailer from "nodemailer";
import cors from "cors";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";
import { initializeApp } from "firebase/app";
import {
  getStorage,
  ref,
  deleteObject,
  uploadBytes,
  listAll,
  getDownloadURL,
} from "firebase/storage";
import fetch from "node-fetch";
import * as faceapi from "face-api.js";
import canvas from "canvas";

const { Canvas, Image, ImageData } = canvas;
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.resolve();

dotenv.config();

// Initialize Firebase
const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
};

const firebaseApp = initializeApp(firebaseConfig);
const storage = getStorage(firebaseApp);

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const pendingApprovals = new Map();
const recognizedFacesCache = []; // In-memory cache for recognized faces

// Load face-api.js models
const loadModels = async () => {
  console.log("Loading models");
  await faceapi.nets.ssdMobilenetv1.loadFromDisk("./models");
  await faceapi.nets.faceLandmark68Net.loadFromDisk("./models");
  await faceapi.nets.faceRecognitionNet.loadFromDisk("./models");
};
loadModels();

const loadRecognizedFaces = async () => {
  try {
    const facesRef = ref(storage, "faces/");
    const imagesList = await listAll(facesRef);

    const faces = await Promise.all(
      imagesList.items.map(async (item) => {
        const url = await getDownloadURL(item);
        const imgBuffer = await fetch(url).then((res) => res.arrayBuffer());
        const imgCanvas = await canvas.loadImage(Buffer.from(imgBuffer));
        const detection = await faceapi
          .detectSingleFace(imgCanvas)
          .withFaceLandmarks()
          .withFaceDescriptor();

        return detection
          ? {
              descriptor: Array.from(detection.descriptor),
              filename: item.name,
            }
          : null;
      })
    );

    recognizedFacesCache.push(...faces.filter(Boolean));
    console.log(
      `Loaded ${recognizedFacesCache.length} recognized faces into cache.`
    );
  } catch (error) {
    console.error("Error loading recognized faces:", error);
  }
};

loadRecognizedFaces();

// Admin upload route
app.post("/api/admin-upload", async (req, res) => {
  const { filename, imageBuffer } = req.body;

  try {
    // Upload the image to Firebase
    const adminRef = ref(storage, `faces/${filename}`);
    await uploadBytes(adminRef, Buffer.from(imageBuffer, "base64"));

    // Process the uploaded image and add to cache
    const imgCanvas = await canvas.loadImage(
      Buffer.from(imageBuffer, "base64")
    );
    const detection = await faceapi
      .detectSingleFace(imgCanvas)
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (detection) {
      recognizedFacesCache.push({
        descriptor: Array.from(detection.descriptor),
        filename,
      });
      console.log(`Added new face to cache: ${filename}`);
    }

    res.status(200).json({ message: "Image uploaded successfully" });
  } catch (error) {
    console.error("Error uploading admin image:", error);
    res.status(500).json({ error: "Failed to upload image" });
  }
});

// Get all admin faces
app.get("/api/admin-faces", async (req, res) => {
  try {
    const facesRef = ref(storage, "faces/");
    const imagesList = await listAll(facesRef);

    const faces = await Promise.all(
      imagesList.items.map(async (item) => {
        const url = await getDownloadURL(item);
        return {
          filename: item.name,
          image: url,
        };
      })
    );

    res.json({ faces });
  } catch (error) {
    console.error("Error fetching faces:", error);
    res.status(500).json({ error: "Failed to fetch faces" });
  }
});

// Delete admin face
app.delete("/api/admin-delete/:filename", async (req, res) => {
  try {
    const { filename } = req.params;
    const faceRef = ref(storage, `faces/${filename}`);
    await deleteObject(faceRef);
    res.json({ message: "Face deleted successfully" });
  } catch (error) {
    console.error("Error deleting face:", error);
    res.status(500).json({ error: "Failed to delete face" });
  }
});

// Approve request route
app.get("/api/approve/:requestId", async (req, res) => {
  const { requestId } = req.params;

  try {
    const pendingRequest = pendingApprovals.get(requestId);
    if (!pendingRequest || pendingRequest.status !== "pending") {
      return res
        .status(400)
        .json({ error: "Invalid or already processed request." });
    }

    const { filename } = pendingRequest;

    // Delete the image from the pending folder
    const pendingRef = ref(storage, `pending/${filename}`);
    await deleteObject(pendingRef);

    pendingApprovals.set(requestId, { ...pendingRequest, status: "approved" });

    res.status(200).json({ message: "Request approved and image deleted." });
  } catch (error) {
    console.error("Error approving request:", error);
    res.status(500).json({ error: "Failed to approve request." });
  }
});

// Deny request route
app.get("/api/deny/:requestId", async (req, res) => {
  const { requestId } = req.params;

  try {
    const pendingRequest = pendingApprovals.get(requestId);
    if (!pendingRequest || pendingRequest.status !== "pending") {
      return res
        .status(400)
        .json({ error: "Invalid or already processed request." });
    }

    const { filename } = pendingRequest;

    // Delete the image from the pending folder
    const pendingRef = ref(storage, `pending/${filename}`);
    await deleteObject(pendingRef);

    pendingApprovals.set(requestId, { ...pendingRequest, status: "denied" });

    res.status(200).json({ message: "Request denied and image deleted." });
  } catch (error) {
    console.error("Error denying request:", error);
    res.status(500).json({ error: "Failed to deny request." });
  }
});

// Add new endpoint for checking request status
app.get("/api/check-status/:requestId", (req, res) => {
  const { requestId } = req.params;
  const request = pendingApprovals.get(requestId);

  if (!request) {
    return res.status(404).json({ error: "Request not found" });
  }

  res.json({ status: request.status });
});

// Process face route
app.post("/api/process-face", async (req, res) => {
  console.log("Received face processing request");
  const { imageData } = req.body;

  if (!imageData) {
    console.log("No image data provided in request");
    return res.status(400).json({ error: "No image data provided" });
  }

  try {
    console.log("Processing image data...");
    const imgBuffer = Buffer.from(imageData, "base64");

    // Validate the buffer contains image data
    if (imgBuffer.length === 0) {
      console.log("Empty image buffer");
      return res.status(400).json({ error: "Empty image buffer" });
    }

    // Load the uploaded image directly from buffer
    const imgCanvas = await canvas.loadImage(imgBuffer);

    const detections = await faceapi
      .detectAllFaces(imgCanvas)
      .withFaceLandmarks()
      .withFaceDescriptors();

    if (detections.length === 0) {
      console.log("No face detected in uploaded image");
      return res.status(400).json({ error: "No face detected in the image." });
    }

    if (detections.length > 1) {
      console.log("Multiple faces detected in uploaded image");
      return res.json({
        isMatch: false,
        error: "Multiple faces detected. Please upload a single face.",
      });
    }

    console.log("Single face detected, performing matching...");
    const uploadedDescriptor = detections[0].descriptor;

    const calculateDistance = (desc1, desc2) =>
      Math.sqrt(
        desc1.reduce((sum, val, i) => sum + Math.pow(val - desc2[i], 2), 0)
      );

    const bestMatch = recognizedFacesCache.reduce(
      (best, face) => {
        const distance = calculateDistance(uploadedDescriptor, face.descriptor);
        return distance < best.distance ? { face, distance } : best;
      },
      { face: null, distance: Infinity }
    );

    if (bestMatch.distance < 0.6) {
      console.log(
        `Match found! Confidence: ${((1 - bestMatch.distance) * 100).toFixed(
          2
        )}%`
      );
      // Don't store the image if it's a match
      return res.json({
        isMatch: true,
        label: bestMatch.face.filename,
        confidence: ((1 - bestMatch.distance) * 100).toFixed(2),
      });
    }

    console.log(`No match found. Best match distance: ${bestMatch.distance}`);
    // Only store unmatched faces in pending folder
    const pendingFilename = `pending_${Date.now()}.jpg`;
    const pendingRef = ref(storage, `pending/${pendingFilename}`);
    await uploadBytes(pendingRef, imgBuffer);

    const downloadURL = await getDownloadURL(pendingRef);

    const requestId = Date.now().toString();
    pendingApprovals.set(requestId, {
      filename: pendingFilename,
      status: "pending",
    });

    const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;
    const approveLink = `${baseUrl}/api/approve/${requestId}`;
    const denyLink = `${baseUrl}/api/deny/${requestId}`;

    const htmlContent = `
      <p>New face recognition request</p>
      <p>Match Result: No match found</p>
      <img src="${downloadURL}" alt="Uploaded face" style="max-width: 300px; margin: 10px 0;" />
      <p>Click to respond:</p>
      <div>
        <a href="${approveLink}" style="background: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; margin-right: 10px;">Approve</a>
        <a href="${denyLink}" style="background: #f44336; color: white; padding: 10px 20px; text-decoration: none;">Deny</a>
      </div>
    `;

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_USER,
      subject: "Face Recognition Approval Needed",
      html: htmlContent,
    };

    await transporter.sendMail(mailOptions);

    res.json({
      isMatch: false,
      pending: true,
      requestId,
    });
  } catch (error) {
    console.error("Error processing face:", error);
    res.status(500).json({ error: "Failed to process face." });
  }
});

if (process.env.NODE_ENV === "developement") {
  // Add middleware to set correct MIME types
  app.use((req, res, next) => {
    if (req.url.endsWith(".js")) {
      res.type("application/javascript");
    }
    next();
  });

  app.use(
    express.static(path.join(__dirname, "/frontend/dist"), {
      setHeaders: (res, path) => {
        if (path.endsWith(".js")) {
          res.setHeader("Content-Type", "application/javascript");
        }
      },
    })
  );

  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "/frontend/dist", "index.html"));
  });
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
