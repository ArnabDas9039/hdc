import express from "express";
import nodemailer from "nodemailer";
import cors from "cors";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";
import { initializeApp } from "firebase/app";
import { getStorage, ref, deleteObject } from "firebase/storage";

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

app.post("/api/send-email", async (req, res) => {
  const { subject, message, image, filename } = req.body;
  const requestId = Date.now().toString();

  // Store the approval request with filename
  pendingApprovals.set(requestId, { image, filename, status: "pending" });

  const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;

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

// Approval endpoint
app.get("/api/approve/:requestId", async (req, res) => {
  const { requestId } = req.params;
  const request = pendingApprovals.get(requestId);

  if (!request) {
    return res.status(404).send("Request not found or already processed");
  }

  try {
    // Delete from Firebase storage directly
    const imageRef = ref(storage, `pending/${request.filename}`);
    await deleteObject(imageRef);

    pendingApprovals.set(requestId, { ...request, status: "approved" });
    res.send("Successfully approved the request!");
  } catch (error) {
    console.error("Error processing approval:", error);
    res.status(500).send("Failed to process approval");
  }
});

// Denial endpoint
app.get("/api/deny/:requestId", async (req, res) => {
  const { requestId } = req.params;
  const request = pendingApprovals.get(requestId);

  if (!request) {
    return res.status(404).send("Request not found or already processed");
  }

  try {
    // Delete from Firebase storage directly
    const imageRef = ref(storage, `pending/${request.filename}`);
    await deleteObject(imageRef);

    pendingApprovals.set(requestId, { ...request, status: "denied" });
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

if (process.env.NODE_ENV === "developement") {
  // Add middleware to set correct MIME types
  app.use((req, res, next) => {
    if (req.url.endsWith(".js")) {
      res.type("application/javascript");
    }
    next();
  });

  app.use(
    express.static(path.join(__dirname, "/face-app/dist"), {
      setHeaders: (res, path) => {
        if (path.endsWith(".js")) {
          res.setHeader("Content-Type", "application/javascript");
        }
      },
    })
  );

  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "/face-app/dist", "index.html"));
  });
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
