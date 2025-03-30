import React, { useEffect, useState, useRef } from "react";
import { storage } from "../firebase";
import {
  ref,
  listAll,
  getDownloadURL,
  uploadBytes,
  deleteObject,
} from "firebase/storage";
import * as faceapi from "@vladmandic/face-api";
import "./styles/App.css";
import { Link } from "react-router-dom";

export default function FaceRecognitionApp() {
  const [groupFaces, setGroupFaces] = useState([]);
  const [matchResult, setMatchResult] = useState(null);
  const fileInputRef = useRef(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const videoRef = useRef(null);
  const [isUsingCamera, setIsUsingCamera] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [requestId, setRequestId] = useState(null);
  const [approvalStatus, setApprovalStatus] = useState(null);
  const [currentFile, setCurrentFile] = useState(null);

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

  // Add status checking interval
  useEffect(() => {
    let intervalId;
    if (requestId) {
      intervalId = setInterval(async () => {
        try {
          const response = await fetch(
            `hdc.onrender.com/api/status/${requestId}`
          );
          const data = await response.json();

          if (data.status !== "pending") {
            setApprovalStatus(data.status);
            clearInterval(intervalId);

            // Delete image from Firebase upon approval/denial
            const storageRef = ref(storage, `pending/${data.filename}`);
            await deleteObject(storageRef);
          }
        } catch (error) {
          console.error("Error checking status:", error);
        }
      }, 5000); // Check every 5 seconds
    }
    return () => intervalId && clearInterval(intervalId);
  }, [requestId]);

  // Handle User Image Upload
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      setIsProcessing(true);
      setCurrentFile(file); // Set the current file first
      setPreviewUrl(URL.createObjectURL(file));

      const img = await faceapi.bufferToImage(file);
      const detections = await faceapi
        .detectSingleFace(img)
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (detections) {
        await matchFace(detections.descriptor, file); // Pass file directly to matchFace
      }
    } catch (error) {
      console.error("Error in file upload:", error);
      setMatchResult({
        isMatch: false,
        error: "Error processing image. Please try again.",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Match Uploaded Face with Firebase Faces
  const matchFace = async (descriptor, file) => {
    // Accept file parameter
    if (!groupFaces.length) {
      setMatchResult({ isMatch: false, error: "No stored faces to compare." });
      return;
    }

    try {
      const labeledDescriptors = groupFaces.map(
        (face) =>
          new faceapi.LabeledFaceDescriptors(face.filename, [
            new Float32Array(face.descriptor),
          ])
      );

      const faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.5); // Changed threshold to 0.7
      const bestMatch = faceMatcher.findBestMatch(descriptor);

      console.log("Best match:", bestMatch.toString());

      const confidence = (1 - bestMatch.distance) * 100;

      // Add failsafe for NaN values
      if (isNaN(confidence)) {
        throw new Error("Invalid confidence score");
      }

      if (bestMatch.distance < 0.5) {
        setMatchResult({
          isMatch: true,
          distance: bestMatch.distance,
          label: bestMatch.label,
          confidence: confidence.toFixed(2),
        });
      } else {
        if (!file) {
          // Use the passed file parameter instead of currentFile
          throw new Error("No image file available");
        }

        // Create a unique filename
        const filename = `pending_${Date.now()}`;
        const storagePath = `pending/${filename}`;
        const storageRef = ref(storage, storagePath);

        // Upload to Firebase directly using the file
        await uploadBytes(storageRef, file);

        // Get the download URL
        const downloadURL = await getDownloadURL(storageRef);

        // Send email with the download URL
        await sendEmail(bestMatch.toString(), downloadURL, filename);

        setMatchResult({
          isMatch: false,
          pending: true,
          distance: bestMatch.distance,
          confidence: confidence.toFixed(2),
        });
      }
    } catch (error) {
      console.error("Error in face matching process:", error);
      setMatchResult({
        isMatch: false,
        error: "Error processing image. Please try again.",
      });
    }
  };

  const sendEmail = async (matchText, imageUrl, filename) => {
    try {
      const response = await fetch(`hdc.onrender.com/api/send-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          subject: "Face Recognition Approval Needed",
          message: `New face recognition request\nMatch Result: ${matchText}`,
          image: imageUrl, // Send the download URL instead of storage path
          filename: filename,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setRequestId(data.requestId);
      } else {
        throw new Error("Failed to send email");
      }
    } catch (error) {
      console.error("Failed to send email:", error);
      alert("Failed to send approval request. Please try again.");
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

  // Cleanup preview URL when component unmounts or when new file is uploaded
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

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

      {matchResult && (
        <div className="result-container">
          {matchResult.isMatch ? (
            <div className="success-message">
              <p className="text-2xl font-bold">
                Congratulations! You are invited!
              </p>
              <p>Match confidence: {matchResult.confidence}%</p>
            </div>
          ) : (
            <div className="error-message">
              {matchResult.pending ? (
                <div>
                  <p>Your request is being reviewed.</p>
                  {approvalStatus === "approved" && (
                    <div className="success-message">
                      <p className="text-2xl font-bold">
                        Your request has been approved!
                      </p>
                    </div>
                  )}
                  {approvalStatus === "denied" && (
                    <div className="error-message">
                      <p className="text-2xl font-bold">
                        Your request has been denied.
                      </p>
                    </div>
                  )}
                  {!approvalStatus && <p>Please wait for admin approval...</p>}
                </div>
              ) : (
                <p>{matchResult.error || "Face not recognized"}</p>
              )}
            </div>
          )}
        </div>
      )}

      {previewUrl && !isUsingCamera && (
        <>
          <div className="preview-container"></div>
          <img src={previewUrl} alt="Preview" className="preview-image" />
        </>
      )}

      <Link to="/admin">{/* <button className="btn">Admin</button> */}</Link>
    </div>
  );
}
