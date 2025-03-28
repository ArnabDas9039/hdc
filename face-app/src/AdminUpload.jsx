import React, { useRef, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import * as faceapi from "@vladmandic/face-api";
import { storage } from "../firebase";
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
  listAll,
} from "firebase/storage";
import "./styles/Admin.css";

export default function AdminUpload() {
  const [adminVerified, setAdminVerified] = useState(false);
  const [groupPhotos, setGroupPhotos] = useState([]);
  const [previewUrl, setPreviewUrl] = useState(null);
  const codeRef = useRef(null);
  const fileInputRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const loadModels = async () => {
      try {
        await faceapi.nets.ssdMobilenetv1.loadFromUri("/models");
        await faceapi.nets.faceLandmark68Net.loadFromUri("/models");
        await faceapi.nets.faceRecognitionNet.loadFromUri("/models");
        console.log("FaceAPI models loaded successfully!");
      } catch (error) {
        console.error("Error loading models:", error);
      }
    };
    loadModels();
  }, []);

  const verifyCode = () => {
    if (codeRef.current.value === "arnab123") {
      setAdminVerified(true);
    } else {
      alert("Incorrect Code");
    }
  };

  useEffect(() => {
    const fetchImages = async () => {
      const storageRef = ref(storage, "faces/");
      const imagesList = await listAll(storageRef);

      const faces = await Promise.all(
        imagesList.items.map(async (item) => {
          const url = await getDownloadURL(item);
          const img = await faceapi.fetchImage(url);
          const detection = await faceapi
            .detectSingleFace(img)
            .withFaceLandmarks()
            .withFaceDescriptor();

          return detection
            ? {
                image: url,
                descriptor: Array.from(detection.descriptor),
                filename: item.name,
              }
            : null;
        })
      );

      setGroupPhotos(faces.filter(Boolean));
    };

    if (adminVerified) {
      fetchImages();
    }
  }, [adminVerified]);

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setPreviewUrl(URL.createObjectURL(file));

    try {
      const img = await faceapi.bufferToImage(file);
      const detection = await faceapi
        .detectSingleFace(img)
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!detection) {
        alert("No face detected in the image");
        return;
      }

      const filename = `face_${Date.now()}_${file.name}`;
      const storageRef = ref(storage, `faces/${filename}`);
      await uploadBytes(storageRef, file);
      const fileUrl = await getDownloadURL(storageRef);

      setGroupPhotos((prev) => [
        ...prev,
        {
          image: fileUrl,
          descriptor: Array.from(detection.descriptor),
          filename,
        },
      ]);
    } catch (error) {
      console.error("Error uploading face:", error);
      alert("Failed to upload image");
    }
  };

  const handleDelete = async (face) => {
    try {
      const storageRef = ref(storage, `faces/${face.filename}`);
      await deleteObject(storageRef);

      const updatedFaces = groupPhotos.filter(
        (f) => f.filename !== face.filename
      );
      setGroupPhotos(updatedFaces);

      alert("Face deleted successfully!");
    } catch (error) {
      console.error("Error deleting face:", error);
      alert("Failed to delete face.");
    }
  };

  return (
    <div className="admin-container">
      {!adminVerified ? (
        <div>
          <h2>Enter Admin Code</h2>
          <input
            type="password"
            ref={codeRef}
            className="admin-input"
            placeholder="Enter admin code"
          />
          <button className="btn" onClick={verifyCode}>
            Verify
          </button>
        </div>
      ) : (
        <div>
          <h1>Upload Group Photos</h1>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept="image/*"
          />
          <button className="btn" onClick={() => navigate("/")}>
            Go to User Page
          </button>

          {previewUrl && (
            <div className="preview-container">
              <img src={previewUrl} alt="Preview" className="preview-image" />
            </div>
          )}

          <h2 className="mt-6 text-xl font-bold">Recognized Faces</h2>
          <div className="grid-container">
            {groupPhotos.map((face, index) => (
              <div key={index} className="image-container">
                <img
                  src={face.image}
                  alt={`Face ${index}`}
                  className="preview-image"
                />
                <button
                  className="delete-btn"
                  onClick={() => handleDelete(face)}
                >
                  ❌
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
