import { defineEveryApp } from "@every-app/sdk";

// defineEveryApp types the manifest. The Gateway keeps it; the Worker gets
// the bindings it lists (env.DB, env.files), never the file.
export default defineEveryApp({
  id: "rental-desk",
  name: "Rental Desk",
  description:
    "Run an equipment rental business: products and stock, availability, orders, documents, payments and an online booking page.",
  access: "everyone",
  resources: {
    d1: ["DB"],
    r2: ["files"],
  },
  // The booking page is for customers outside the organization: its pages,
  // the JSON they call, product images, and the built assets they load.
  public: [
    { path: "/shop", methods: ["GET"] },
    { path: "/shop/**", methods: ["GET", "POST"] },
  ],
  publicAssets: ["/assets/**", "/icon.svg"],
});
