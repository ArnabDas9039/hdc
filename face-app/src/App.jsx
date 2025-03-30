import React, { useState, useRef, useEffect } from "react";
import "./styles/App.css";
import { Link } from "react-router-dom";

export default function FaceRecognitionApp() {
  const [matchResult, setMatchResult] = useState(null);
  const fileInputRef = useRef(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [requestId, setRequestId] = useState(null);
  const [approvalStatus, setApprovalStatus] = useState(null);

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      setIsProcessing(true);
      setPreviewUrl(URL.createObjectURL(file));

      // Convert image to base64
      const reader = new FileReader();
      reader.onload = async (e) => {
        const response = await fetch(
          `${import.meta.env.VITE_API_URL || ""}/api/process-face`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              imageData: e.target.result,
            }),
          }
        );

        const result = await response.json();
        setMatchResult(result);
        if (result.requestId) {
          setRequestId(result.requestId);
        }
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error("Error:", error);
      setMatchResult({
        isMatch: false,
        error: "Error processing image. Please try again.",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileSelect = () => {
    if (fileInputRef.current) {
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

      {previewUrl && (
        <>
          <div className="preview-container"></div>
          <img src={previewUrl} alt="Preview" className="preview-image" />
        </>
      )}

      <Link to="/admin">{/* <button className="btn">Admin</button> */}</Link>
    </div>
  );
}
