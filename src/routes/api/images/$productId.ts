import { createFileRoute } from "@tanstack/react-router";
import { getEveryAppUser, isAdmin } from "@every-app/sdk/server";
import { env } from "cloudflare:workers";
import { readImage, saveImage } from "@/server/products";

// Product images for members (any product), uploaded by admins.
export const Route = createFileRoute("/api/images/$productId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const user = await getEveryAppUser(request, env);
        if (!user) return new Response("Unauthorized", { status: 401 });
        return readImage(params.productId, false);
      },
      POST: async ({ request, params }) => {
        const user = await getEveryAppUser(request, env);
        if (!user) return new Response("Unauthorized", { status: 401 });
        if (!isAdmin(user)) return Response.json({ error: "Only admins can do this." }, { status: 403 });
        return saveImage(params.productId, request);
      },
    },
  },
});
