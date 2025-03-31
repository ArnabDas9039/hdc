import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import "./styles/Face.css";
import "./styles/Loading.css";
import { Link } from "react-router-dom";
import FlowerApp from "./Flower";

export default function FaceRecognitionApp() {
  const [matchResult, setMatchResult] = useState(null);
  const fileInputRef = useRef(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [requestId, setRequestId] = useState(null);
  const [approvalStatus, setApprovalStatus] = useState(null);
  const statusCheckInterval = useRef(null);
  const navigate = useNavigate();

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    console.log("File selected:", file.name);
    setPreviewUrl(URL.createObjectURL(file));
    setIsProcessing(true);

    try {
      // Convert FileReader to Promise
      const base64Image = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const filename = `face_${Date.now()}_${file.name}`;
      console.log("Sending file to API:", filename);

      const apiUrl = `${import.meta.env.VITE_API_URL || ""}/api/process-face`;
      console.log("Using API URL:", apiUrl);

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          imageData: base64Image,
        }),
      });

      console.log("API Response status:", response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Server error:", errorText);
        throw new Error(`Server error: ${response.status}`);
      }

      const data = await response.json();
      console.log("API Response data:", data);

      if (data.isMatch) {
        console.log("Match found:", data);
        setMatchResult({
          isMatch: true,
          label: data.label,
          confidence: data.confidence,
        });
      } else if (data.pending) {
        console.log("Request pending approval");
        setRequestId(data.requestId);
        setMatchResult({ isMatch: false, pending: true });

        // Start polling for status updates
        if (statusCheckInterval.current) {
          clearInterval(statusCheckInterval.current);
        }
        statusCheckInterval.current = setInterval(() => {
          checkRequestStatus(data.requestId);
        }, 5000); // Check every 5 seconds
      } else {
        console.log("No match found");
        setMatchResult({
          isMatch: false,
          error: data.error || "Face not recognized",
        });
      }
    } catch (error) {
      console.error("Error in file upload:", error);
      setMatchResult({
        isMatch: false,
        error: error.message || "Error processing image. Please try again.",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const checkRequestStatus = async (id) => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || ""}/api/check-status/${id}`
      );
      const data = await response.json();

      if (data.status === "approved" || data.status === "denied") {
        clearInterval(statusCheckInterval.current);
        setApprovalStatus(data.status);
      }
    } catch (error) {
      console.error("Error checking request status:", error);
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
      if (statusCheckInterval.current) {
        clearInterval(statusCheckInterval.current);
      }
    };
  }, [previewUrl]);

  useEffect(() => {
    if (isProcessing) {
      // console.log("Processing started...");
    } else {
      // console.log("Processing ended.");
    }
  }, [isProcessing]);

  useEffect(() => {
    if (matchResult?.isMatch || approvalStatus === "approved") {
      navigate("/invite");
    }
  }, [matchResult, approvalStatus, navigate]);

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
      {previewUrl && (
        <div className="preview-container">
          <img src={previewUrl} alt="Preview" className="preview-image" />
          {isProcessing && <div className="loading-circle"></div>}
        </div>
      )}

      {matchResult && (
        <div className="result-container">
          {matchResult.isMatch ? (
            <div className="success-message">
              <p>Match confidence: {matchResult.confidence}%</p>
            </div>
          ) : (
            <div className="error-message">
              {matchResult.pending ? (
                <div>
                  {approvalStatus ? (
                    <p>
                      Your request has been {approvalStatus}.
                      {approvalStatus === "denied" && " Please try again."}
                    </p>
                  ) : (
                    <p>Your request is being reviewed...</p>
                  )}
                </div>
              ) : (
                <p>{matchResult.error || "Face not recognized"}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
