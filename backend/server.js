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
  uploadBytes,
  getDownloadURL,
  deleteObject,
  listAll,
} from "firebase/storage";
import * as faceapi from "@vladmandic/face-api";
import canvas from "canvas";
import fetch from "node-fetch";

// Setup face-api.js with canvas
const { Canvas, Image, ImageData } = canvas;
faceapi.env.monkeyPatch({ Canvas, Image, ImageData, fetch });

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

// Store pending approvals in memory (replace with database in production)
const pendingApprovals = new Map();

// Load face-api models with error handling
let modelsLoaded = false;
const loadModels = async () => {
  try {
    const modelPath = path.join(__dirname, "models");
    await faceapi.nets.ssdMobilenetv1.loadFromDisk(modelPath);
    await faceapi.nets.faceLandmark68Net.loadFromDisk(modelPath);
    await faceapi.nets.faceRecognitionNet.loadFromDisk(modelPath);
    modelsLoaded = true;
    console.log("Face-api models loaded successfully");
  } catch (error) {
    console.error("Error loading face-api models:", error);
    throw error;
  }
};

// Initialize models with retry
const initializeModels = async () => {
  let retries = 3;
  while (retries > 0) {
    try {
      await loadModels();
      break;
    } catch (error) {
      retries--;
      if (retries === 0) {
        console.error("Failed to load models after 3 attempts");
        process.exit(1);
      }
      console.log(`Retrying model loading... (${retries} attempts remaining)`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
};

initializeModels();

// Ensure PORT is defined before using it
const PORT = process.env.PORT || 3001;

// Update email links to use PORT correctly
const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;

// Process and match face endpoint
app.post("/api/process-face", async (req, res) => {
  if (!modelsLoaded) {
    return res.status(503).json({ error: "Face detection models not loaded" });
  }

  const { imageData } = req.body;

  try {
    // Convert base64 to buffer
    const buffer = Buffer.from(imageData.split(",")[1], "base64");
    const img = await canvas.loadImage(buffer);

    // Detect face using face-api
    const detection = await faceapi
      .detectSingleFace(img)
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!detection) {
      return res.status(400).json({ error: "No face detected" });
    }

    // Get all faces from Firebase
    const storageRef = ref(storage, "faces/");
    const imagesList = await listAll(storageRef);

    // Process stored faces
    const faces = await Promise.all(
      imagesList.items.map(async (item) => {
        const url = await getDownloadURL(item);
        const faceImg = await canvas.loadImage(url);
        const faceDetection = await faceapi
          .detectSingleFace(faceImg)
          .withFaceLandmarks()
          .withFaceDescriptor();

        return faceDetection
          ? {
              descriptor: faceDetection.descriptor,
              filename: item.name,
            }
          : null;
      })
    );

    const validFaces = faces.filter(Boolean);

    if (validFaces.length === 0) {
      return res.json({ isMatch: false, error: "No stored faces to compare" });
    }

    // Create face matcher and find best match
    const labeledDescriptors = validFaces.map(
      (face) =>
        new faceapi.LabeledFaceDescriptors(face.filename, [face.descriptor])
    );
    const faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.6);
    const bestMatch = faceMatcher.findBestMatch(detection.descriptor);

    if (bestMatch.label !== "unknown") {
      return res.json({
        isMatch: true,
        confidence: ((1 - bestMatch.distance) * 100).toFixed(2),
        label: bestMatch.label,
      });
    }

    // Handle no match case
    const filename = `pending_${Date.now()}.jpg`;
    const pendingRef = ref(storage, `pending/${filename}`);
    await uploadBytes(pendingRef, buffer);

    // Send email for approval
    const approveLink = `${baseUrl}/api/approve/${filename}`;
    const denyLink = `${baseUrl}/api/deny/${filename}`;

    const htmlContent = `
      <p>A new face has been detected and requires approval.</p>
      <p>Click to respond:</p>
      <div>
        <a href="${approveLink}" style="background: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; margin-right: 10px;">Approve</a>
        <a href="${denyLink}" style="background: #f44336; color: white; padding: 10px 20px; text-decoration: none;">Deny</a>
      </div>
    `;

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_USER,
      subject: "Face Approval Request",
      html: htmlContent,
    };

    try {
      await transporter.sendMail(mailOptions);
    } catch (error) {
      console.error("Error sending email:", error);
    }

    res.json({
      isMatch: false,
      pending: true,
      confidence: ((1 - bestMatch.distance) * 100).toFixed(2),
    });
  } catch (error) {
    console.error("Error processing face:", error);
    res.status(500).json({ error: "Error processing image" });
  }
});

app.post("/api/send-email", async (req, res) => {
  const { subject, message, image, filename } = req.body;
  const requestId = Date.now().toString();

  // Store the approval request with filename
  pendingApprovals.set(requestId, { image, filename, status: "pending" });

  const approveLink = `${baseUrl}/api/approve/${requestId}`;
  const denyLink = `${baseUrl}/api/deny/${requestId}`;

  const htmlContent = `
    <p>${message}</p>
    <p>${image}</p>
    <p>Click to respond:</p>
    <div>
      <a href="${approveLink}" style="background: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; margin-right: 10px;">Approve</a>
      <a href="${denyLink}" style="background: #f44336; color: white; padding: 10px 20px; text-decoration: none;">Deny</a>
    </div>
  `;

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: process.env.EMAIL_USER,
    subject: subject,
    html: htmlContent,
  };

  try {
    await transporter.sendMail(mailOptions);
    res.status(200).json({ requestId });
  } catch (error) {
    console.error("Error sending email:", error);
    res.status(500).send("Failed to send email");
  }
});

// Standardize pendingApprovals usage
app.get("/api/approve/:filename", async (req, res) => {
  const { filename } = req.params;

  try {
    const imageRef = ref(storage, `pending/${filename}`);
    await deleteObject(imageRef);

    res.send("Successfully approved the request!");
  } catch (error) {
    console.error("Error processing approval:", error);
    res.status(500).send("Failed to process approval");
  }
});

app.get("/api/deny/:filename", async (req, res) => {
  const { filename } = req.params;

  try {
    const imageRef = ref(storage, `pending/${filename}`);
    await deleteObject(imageRef);

    res.send("Request has been denied.");
  } catch (error) {
    console.error("Error processing denial:", error);
    res.status(500).send("Failed to process denial");
  }
});

// Status check endpoint
app.get("/api/status/:requestId", async (req, res) => {
  const { requestId } = req.params;
  const request = pendingApprovals.get(requestId);

  if (!request) {
    return res.status(404).json({ status: "not_found" });
  }

  res.json({ status: request.status });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
