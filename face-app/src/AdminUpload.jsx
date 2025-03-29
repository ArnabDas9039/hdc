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
      } catch (error) {}
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
      setPreviewUrl(null);

      alert("Face deleted successfully!");
    } catch (error) {
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
              <img src={previewUrl} alt="Preview" className="preview-images" />
            </div>
          )}

          <h2 className="mt-6 text-xl font-bold">Recognized Faces</h2>
          <div className="grid-container">
            {groupPhotos.map((face, index) => (
              <div key={index} className="image-container">
                <img
                  src={face.image}
                  alt={`Face ${index}`}
                  className="preview-images"
                />
                <button
                  className="delete-btn"
                  onClick={() => handleDelete(face)}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    height="24px"
                    viewBox="0 -960 960 960"
                    width="24px"
                    fill="#e8eaed"
                  >
                    <path d="M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
