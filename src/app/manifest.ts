import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/", name: "랠리온", short_name: "랠리온", lang: "ko", start_url: "/", scope: "/", display: "standalone",
    background_color: "#f7f8f2", theme_color: "#f7f8f2",
    description: "부담 없이, 함께 테니스",
    icons: [{ src: "/images/brand/app-icon-1024.png", sizes: "1024x1024", type: "image/png", purpose: "any" }],
  };
}
