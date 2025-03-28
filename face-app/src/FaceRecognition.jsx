import React, { useEffect, useRef, useState } from "react";
import * as faceapi from "@vladmandic/face-api";
import emailjs from "emailjs-com";

export default function FaceRecognitionApp() {
  const [groupFaces, setGroupFaces] = useState([]);
  const [matchResult, setMatchResult] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const loadModels = async () => {
      await faceapi.nets.ssdMobilenetv1.loadFromUri("/models");
      await faceapi.nets.faceLandmark68Net.loadFromUri("/models");
      await faceapi.nets.faceRecognitionNet.loadFromUri("/models");
      const storedFaces = JSON.parse(localStorage.getItem("groupPhotos")) || [];
      setGroupFaces(storedFaces);
    };
    loadModels();
  }, []);

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const img = await faceapi.bufferToImage(file);
    const detections = await faceapi
      .detectSingleFace(img)
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (detections) {
      matchFace(detections.descriptor, file);
    }
  };

  const matchFace = (descriptor, file) => {
    if (!groupFaces.length) {
      setMatchResult("No stored faces to compare.");
      return;
    }

    const labeledDescriptors = groupFaces.map(
      (face) => new faceapi.LabeledFaceDescriptors("Group", [face.descriptor])
    );
    const faceMatcher = new faceapi.FaceMatcher(labeledDescriptors);
    const bestMatch = faceMatcher.findBestMatch(descriptor);

    setMatchResult(bestMatch.toString());

    sendEmail(file, bestMatch.toString());
  };

  const sendEmail = (file, matchText) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onloadend = () => {
      emailjs
        .send(
          "service_z0e26t9",
          "template_d3fms9p",
          {
            to_email: "arnabdas.9039@gmail.com",
            subject: "Face Recognition Alert",
            message: `User uploaded an image.\nMatch Result: ${matchText}`,
            image: reader.result,
          },
          "YOUR_USER_ID"
        )
        .then((response) => console.log("Email sent:", response))
        .catch((error) => console.error("Email error:", error));
    };
  };

  return (
    <div className="p-4 text-center">
      <h1 className="text-2xl font-bold">Face Recognition App</h1>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept="image/*"
      />
      {matchResult && (
        <p className="mt-4 text-lg font-semibold">
          Match Result: {matchResult}
        </p>
      )}
    </div>
  );
}

if (detections.length) {
  // Upload image to Firebase
  const storageRef = ref(storage, `faces/${file.name}`);
  await uploadBytes(storageRef, file);
  const fileUrl = await getDownloadURL(storageRef);

  // Add new face to state
  setGroupPhotos((prev) => [...prev, { image: fileUrl }]);
}
