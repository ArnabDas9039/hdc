import React, { useRef, useState } from "react";
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
    if (codeRef.current.value === "arnab123") {
      setAdminVerified(true);
      fetchImages();
    } else {
      alert("Incorrect Code");
    }
  };

  const fetchImages = async () => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || ""}/api/faces`
      );
      const faces = await response.json();
      setGroupPhotos(faces);
    } catch (error) {
      console.error("Error fetching faces:", error);
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setPreviewUrl(URL.createObjectURL(file));

    try {
      const formData = new FormData();
      formData.append("image", file);

      const response = await fetch(
        `${import.meta.env.VITE_API_URL || ""}/api/upload-face`,
        {
          method: "POST",
          body: formData,
        }
      );

      if (response.ok) {
        await fetchImages();
      } else {
        throw new Error("Upload failed");
      }
    } catch (error) {
      console.error("Error uploading face:", error);
      alert("Failed to upload image");
    }
  };

  const handleDelete = async (face) => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || ""}/api/delete-face/${
          face.filename
        }`,
        {
          method: "DELETE",
        }
      );

      if (response.ok) {
        await fetchImages();
        setPreviewUrl(null);
        alert("Face deleted successfully!");
      } else {
        throw new Error("Delete failed");
      }
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
