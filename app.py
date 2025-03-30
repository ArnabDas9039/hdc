from flask import Flask, request, jsonify, session, send_from_directory, render_template
import firebase_admin
from firebase_admin import credentials, storage
from deepface import DeepFace
import numpy as np
import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from PIL import Image
import io

app = Flask(__name__, static_folder="static")
app.secret_key = "your_secret_key"  # Change this for security

# Firebase setup
cred = credentials.Certificate("face-app-e86e5-firebase-adminsdk-fbsvc-8d88d4f80e.json")
firebase_admin.initialize_app(
    cred, {"storageBucket": "face-app-e86e5.firebasestorage.app"}
)
bucket = storage.bucket()

# SMTP Configuration
EMAIL_USER = "arnabdas.9039@gmail.com"
EMAIL_PASS = "grqr zsop csqm ehxh"

# Admin credentials (for simplicity, using hardcoded password)
ADMIN_PASSWORD = "arnab123"


def send_email(to_email, link, request_id):
    subject = "Manual Approval Required"
    body = f"A new face was detected that requires approval.\n\nView it here: {link}\nRequest ID: {request_id}"

    msg = MIMEMultipart()
    msg["From"] = EMAIL_USER
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.attach(MIMEText(body, "plain"))

    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
        server.login(EMAIL_USER, EMAIL_PASS)
        server.sendmail(EMAIL_USER, to_email, msg.as_string())


@app.route("/")
def serve_user_page():
    return render_template("user.html")


@app.route("/admin")
def serve_admin_page():
    return render_template("admin.html")


@app.route("/upload", methods=["POST"])
def upload_image():
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400

    file = request.files["file"]
    filename = file.filename

    # Save the file temporarily for processing
    temp_path = f"/tmp/{filename}"
    file.save(temp_path)

    blob = bucket.blob(f"faces/{filename}")
    blob.upload_from_filename(temp_path)
    blob.make_public()
    image_url = blob.public_url

    # Load the saved file for DeepFace processing
    try:
        result = DeepFace.find(
            img_path=temp_path,
            db_path="/tmp/faces_db",  # Temporary directory for known faces
            model_name="VGG-Face",
            enforce_detection=False,
        )
        if len(result) > 0:
            os.remove(temp_path)  # Clean up temporary file
            return jsonify({"message": "You are invited"})
    except Exception as e:
        print(f"DeepFace error: {e}")

    os.remove(temp_path)  # Clean up temporary file
    request_id = os.urandom(8).hex()
    send_email("arnabdas.9039@gmail.com", image_url, request_id)
    return jsonify(
        {
            "message": "No match found, manual approval required",
            "request_id": request_id,
        }
    )


@app.route("/admin/upload", methods=["POST"])
def admin_upload():
    if not session.get("admin_logged_in"):
        return jsonify({"error": "Unauthorized"}), 403

    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400

    file = request.files["file"]
    filename = file.filename
    blob = bucket.blob(f"faces/{filename}")
    blob.upload_from_file(file)
    blob.make_public()
    return jsonify({"message": "Image uploaded successfully", "url": blob.public_url})


@app.route("/admin/login", methods=["POST"])
def admin_login():
    data = request.get_json()
    if data.get("password") == ADMIN_PASSWORD:
        session["admin_logged_in"] = True
        return jsonify({"message": "Login successful"})
    return jsonify({"error": "Invalid password"}), 403


@app.route("/admin/logout", methods=["POST"])
def admin_logout():
    session.pop("admin_logged_in", None)
    return jsonify({"message": "Logged out"})


if __name__ == "__main__":
    app.run(debug=True)
