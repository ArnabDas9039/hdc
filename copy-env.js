import fs from "fs";
import path from "path";

const __dirname = path.resolve();
const sourcePath = path.resolve(__dirname, ".env");
const destinationPath = path.resolve(__dirname, "face-app", ".env");

try {
  fs.copyFileSync(sourcePath, destinationPath);
  console.log(".env file copied to face-app directory.");
} catch (error) {
  console.error("Error copying .env file:", error);
  process.exit(1);
}
