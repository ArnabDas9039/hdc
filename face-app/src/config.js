const isDevelopment = import.meta.env.DEV;
const baseUrl = isDevelopment ? "http://localhost:5173" : "";

export const config = {
  apiUrl: baseUrl,
};
