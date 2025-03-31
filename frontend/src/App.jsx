import "./index.css";
import FaceRecognitionApp from "./FaceRecognitionApp";
import AdminUpload from "./AdminUpload";
import { Route, Routes } from "react-router-dom";

function App() {
  return (
    <Routes>
      <Route path="/" element={<FaceRecognitionApp />} />
      <Route path="/admin" element={<AdminUpload />} />
    </Routes>
  );
}

export default App;
