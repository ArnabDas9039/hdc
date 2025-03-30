/* script.js */
function uploadImage() {
  let file = document.getElementById("imageInput").files[0];
  if (!file) return alert("Please select a file");
  let formData = new FormData();
  formData.append("file", file);

  fetch("/upload", { method: "POST", body: formData })
    .then((res) => res.json())
    .then(
      (data) => (document.getElementById("response").innerText = data.message)
    )
    .catch((err) => console.error("Error:", err));
}

function adminLogin() {
  let password = document.getElementById("adminPassword").value;
  fetch("/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  })
    .then((res) => res.json())
    .then((data) => {
      document.getElementById("loginResponse").innerText = data.message;
      if (data.message === "Login successful") {
        document.getElementById("adminPanel").style.display = "block";
      }
    })
    .catch((err) => console.error("Error:", err));
}

function adminUpload() {
  let file = document.getElementById("adminImageInput").files[0];
  if (!file) return alert("Please select a file");
  let formData = new FormData();
  formData.append("file", file);

  fetch("/admin/upload", { method: "POST", body: formData })
    .then((res) => res.json())
    .then(
      (data) =>
        (document.getElementById("adminResponse").innerText = data.message)
    )
    .catch((err) => console.error("Error:", err));
}
