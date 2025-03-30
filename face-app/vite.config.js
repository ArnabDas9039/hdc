import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd()); // Load environment variables

  return {
    plugins: [react()],
    base: "/",
    define: {
      "import.meta.env": JSON.stringify(env), // Correct way to pass env variables
    },
  };
});
