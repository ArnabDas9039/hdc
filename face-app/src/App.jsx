import React, { useEffect, useState, useRef } from "react";
import { storage } from "../firebase";
import { ref, listAll, getDownloadURL } from "firebase/storage";
import * as faceapi from "@vladmandic/face-api";
import "./styles/App.css";

export default function FaceRecognitionApp() {
  const [groupFaces, setGroupFaces] = useState([]);
  const [matchResult, setMatchResult] = useState(null);
  const fileInputRef = useRef(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const videoRef = useRef(null);
  const [isUsingCamera, setIsUsingCamera] = useState(false);

  // 🔹 Load Face-API models and Fetch Firebase Images
  useEffect(() => {
    const loadModelsAndFetchFaces = async () => {
      try {
        await faceapi.nets.ssdMobilenetv1.loadFromUri("/models");
        await faceapi.nets.faceLandmark68Net.loadFromUri("/models");
        await faceapi.nets.faceRecognitionNet.loadFromUri("/models");

        const storageRef = ref(storage, "faces/");
        const imagesList = await listAll(storageRef);

        const fetchedFaces = await Promise.all(
          imagesList.items.map(async (item) => {
            const url = await getDownloadURL(item);
            const img = await faceapi.fetchImage(url);
            const detection = await faceapi
              .detectSingleFace(img)
              .withFaceLandmarks()
              .withFaceDescriptor();

            return detection
              ? {
                  descriptor: Array.from(detection.descriptor),
                  image: url,
                  filename: item.name,
                }
              : null;
          })
        );

        setGroupFaces(fetchedFaces.filter(Boolean));
      } catch (error) {
        console.error("Error loading models or fetching faces:", error);
      }
    };

    loadModelsAndFetchFaces();
  }, []);

  // Handle User Image Upload
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setPreviewUrl(URL.createObjectURL(file));

    const img = await faceapi.bufferToImage(file);
    const detections = await faceapi
      .detectSingleFace(img)
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (detections) {
      matchFace(detections.descriptor);
    }
  };

  // Match Uploaded Face with Firebase Faces
  const matchFace = (descriptor) => {
    if (!groupFaces.length) {
      setMatchResult("No stored faces to compare.");
      return;
    }

    try {
      const labeledDescriptors = groupFaces.map(
        (face) =>
          new faceapi.LabeledFaceDescriptors(face.filename, [
            new Float32Array(face.descriptor),
          ])
      );

      const faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.5); // Changed threshold to 0.5
      const bestMatch = faceMatcher.findBestMatch(descriptor);

      if (bestMatch.distance < 0.5) {
        setMatchResult({
          isMatch: true,
          distance: bestMatch.distance,
          label: bestMatch.label,
        });

        const matchedFace = groupFaces.find(
          (f) => f.filename === bestMatch.label
        );
        if (matchedFace) {
          sendEmail(bestMatch.toString(), matchedFace.image);
        }
      } else {
        setMatchResult({
          isMatch: false,
          distance: bestMatch.distance,
          label: bestMatch.label,
        });
      }
    } catch (error) {
      console.error("Error matching face:", error);
      setMatchResult({ isMatch: false, error: "Error matching face" });
    }
  };

  const sendEmail = (matchText, imageUrl) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      emailjs
        .send(
          "service_z0e26t9",
          "template_d3fms9p",
          {
            to_email: "arnabdas.9039@gmail.com",
            subject: "Face Recognition Alert",
            message: `User uploaded an image.\nMatch Result: ${matchText}`,
            image: imageUrl,
          },
          "YOUR_USER_ID"
        )
        .then((response) => console.log("Email sent:", response))
        .catch((error) => console.error("Email error:", error));
    };
  };

  const startCamera = async () => {
    try {
      const constraints = {
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      };

      // Stop any existing video stream before starting a new one
      if (videoRef.current && videoRef.current.srcObject) {
        const tracks = videoRef.current.srcObject.getTracks();
        tracks.forEach((track) => track.stop());
      }

      // Request access to the camera
      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setIsUsingCamera(true);
    } catch (error) {
      console.error("Error accessing camera:", error);

      if (error.name === "NotAllowedError") {
        alert("Camera access denied. Please allow camera permissions.");
      } else if (error.name === "NotFoundError") {
        alert("No camera found. Please connect a camera.");
      } else if (error.name === "OverconstrainedError") {
        alert("Camera constraints are too strict. Try lowering resolution.");
      } else {
        alert("Unable to access camera. Please check your device settings.");
      }
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const captureImage = async () => {
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext("2d").drawImage(videoRef.current, 0, 0);

    canvas.toBlob(async (blob) => {
      const file = new File([blob], "capture.jpg", { type: "image/jpeg" });
      handleFileUpload({ target: { files: [file] } });
      stopCamera();
    }, "image/jpeg");
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach((track) => track.stop());
      setIsUsingCamera(false);
    }
  };

  const handleCameraCapture = () => {
    if (fileInputRef.current) {
      fileInputRef.current.setAttribute("capture", "environment");
      fileInputRef.current.click();
    }
  };

  const handleFileSelect = () => {
    if (fileInputRef.current) {
      fileInputRef.current.removeAttribute("capture");
      fileInputRef.current.click();
    }
  };

  return (
    <div className="app-container">
      <div className="input-container">
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileUpload}
          accept="image/*"
          className="file-input"
        />

        <div className="button-group">
          <button className="btn" onClick={handleFileSelect}>
            Upload Photo
          </button>
          <button className="btn camera-btn" onClick={handleCameraCapture}>
            Take Photo
          </button>
        </div>
      </div>

      {previewUrl && !isUsingCamera && (
        <>
          <div className="preview-container"></div>
          <img src={previewUrl} alt="Preview" className="preview-image" />
        </>
      )}

      {matchResult && (
        <div className="result-container">
          {matchResult.isMatch ? (
            <div className="success-message">
              <p className="text-2xl font-bold">
                🎉 Congratulations! You are invited! 🎉
              </p>
              <p>
                Match confidence:{" "}
                {((1 - matchResult.distance) * 100).toFixed(2)}%
              </p>
            </div>
          ) : (
            <div className="error-message">
              <p>Sorry, you are not on the guest list</p>{" "}
              {matchResult.error ? (
                <p>{matchResult.error}</p>
              ) : (
                <p>
                  Best match confidence:{" "}
                  {((1 - matchResult.distance) * 100).toFixed(2)}%
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
