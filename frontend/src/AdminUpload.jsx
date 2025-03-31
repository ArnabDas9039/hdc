import React, { useRef, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./styles/Admin.css";

export default function AdminUpload() {
  const [adminVerified, setAdminVerified] = useState(false);
  const [groupPhotos, setGroupPhotos] = useState([]);
  const [previewUrl, setPreviewUrl] = useState(null);
  const codeRef = useRef(null);
  const fileInputRef = useRef(null);
  const navigate = useNavigate();

  const verifyCode = () => {
    const adminCode = "arnab123";
    const enteredCode = codeRef.current?.value;

    if (enteredCode === adminCode) {
      setAdminVerified(true);
    } else {
      alert("Invalid admin code");
      if (codeRef.current) {
        codeRef.current.value = "";
      }
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setPreviewUrl(URL.createObjectURL(file));

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64Image = reader.result.split(",")[1];
        const filename = `face_${Date.now()}_${file.name}`;

        const response = await fetch(
          `${import.meta.env.VITE_API_URL || ""}/api/admin-upload`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              filename,
              imageBuffer: base64Image,
            }),
          }
        );

        if (response.ok) {
          setGroupPhotos((prev) => [
            ...prev,
            {
              filename,
              image: URL.createObjectURL(file),
            },
          ]);
        } else {
          throw new Error("Failed to upload image");
        }
      };

      reader.readAsDataURL(file);
    } catch (error) {
      console.error("Error uploading image:", error);
      alert("Failed to upload image");
    }
  };

  const handleDelete = async (face) => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || ""}/api/admin-delete/${
          face.filename
        }`,
        { method: "DELETE" }
      );

      if (response.ok) {
        const updatedFaces = groupPhotos.filter(
          (f) => f.filename !== face.filename
        );
        setGroupPhotos(updatedFaces);
        setPreviewUrl(null);
        alert("Face deleted successfully!");
      } else {
        throw new Error("Failed to delete image");
      }
    } catch (error) {
      alert("Failed to delete face.");
    }
  };

  useEffect(() => {
    const fetchImages = async () => {
      if (!adminVerified) return;

      try {
        const response = await fetch(
          `${import.meta.env.VITE_API_URL || ""}/api/admin-faces`
        );
        const data = await response.json();
        setGroupPhotos(data.faces);
      } catch (error) {
        console.error("Error fetching faces:", error);
      }
    };

    fetchImages();
  }, [adminVerified]);

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
