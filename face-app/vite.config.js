import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import dotenv from "dotenv";
import path from "path";

// Load the .env file from the root directory
dotenv.config({ path: path.resolve(__dirname, "../.env") });

export default defineConfig({
  plugins: [react()],
  base: "/",
  define: {
    "process.env": process.env, // Pass environment variables to the app
  },
});
