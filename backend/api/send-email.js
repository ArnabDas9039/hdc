import nodemailer from "nodemailer";
import { initializeApp } from "firebase/app";
import { getStorage } from "firebase/storage";
import { Buffer } from "buffer";

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
};

const firebaseApp = initializeApp(firebaseConfig);
const storage = getStorage(firebaseApp);

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Store pending approvals (use database in production)
const pendingApprovals = new Map();

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { subject, message, image, filename } = req.body;
  const requestId = Date.now().toString();

  // Fetch the image from the URL
  let imageBuffer;
  try {
    const response = await fetch(image);
    const arrayBuffer = await response.arrayBuffer();
    imageBuffer = Buffer.from(arrayBuffer);
  } catch (error) {
    console.error("Failed to fetch image:", error);
    return res.status(500).json({ error: "Failed to fetch image" });
  }

  pendingApprovals.set(requestId, { image, filename, status: "pending" });

  const approveLink = `/api/approve/${requestId}`;
  const denyLink = `/api/deny/${requestId}`;

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: process.env.ADMIN_EMAIL,
      subject,
      html: `
        <p>${message}</p>
        <p>Click to respond:</p>
        <a href="${approveLink}">Approve</a> | 
        <a href="${denyLink}">Deny</a>
      `,
      attachments: [
        {
          filename: filename || "image.jpg",
          content: imageBuffer,
        },
      ],
    });

    res.status(200).json({ requestId });
  } catch (error) {
    console.error("Email sending failed:", error);
    res.status(500).json({ error: "Failed to send email" });
  }
}
