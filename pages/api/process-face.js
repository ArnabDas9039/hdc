import {
  getStorage,
  ref,
  listAll,
  getDownloadURL,
  uploadBytes,
} from "firebase/storage";
import * as faceapi from "@vladmandic/face-api";
import canvas from "canvas";
import {
  initializeFirebase,
  loadFaceApiModels,
} from "../../utils/server-utils";
import nodemailer from "nodemailer";

const { Canvas, Image, ImageData } = canvas;
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

initializeFirebase();
const storage = getStorage();

let modelsLoaded = false;
loadFaceApiModels().then(() => {
  modelsLoaded = true;
});

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!modelsLoaded) {
    return res.status(503).json({ error: "Face detection models not loaded" });
  }

  const { imageData } = req.body;

  try {
    const buffer = Buffer.from(imageData.split(",")[1], "base64");
    const img = await canvas.loadImage(buffer);

    const detection = await faceapi
      .detectSingleFace(img)
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!detection) {
      return res.status(400).json({ error: "No face detected" });
    }

    const storageRef = ref(storage, "faces/");
    const imagesList = await listAll(storageRef);

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

    const filename = `pending_${Date.now()}.jpg`;
    const pendingRef = ref(storage, `pending/${filename}`);
    await uploadBytes(pendingRef, buffer);

    const baseUrl = process.env.BASE_URL || `http://localhost:3000`;
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
}
