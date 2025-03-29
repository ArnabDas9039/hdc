import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import FaceRecognitionApp from "./App";
import AdminUpload from "./AdminUpload";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Router>
      <Routes>
        <Route path="/" element={<FaceRecognitionApp />} />
        <Route path="/admin" element={<AdminUpload />} />
      </Routes>
    </Router>
  </React.StrictMode>
);
