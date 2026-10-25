import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    // Keep the React runtime in a separate cached file. Lazy route imports in
    // App.tsx also keep map/account/registration code out of the initial page.
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "react-vendor",
              test: /node_modules[\\/]react(?:-dom)?[\\/]/,
              priority: 20,
            },
          ],
        },
      },
    },
  },
});
