import { createFileRoute } from "@tanstack/react-router";
import { readImage } from "@/server/products";

// Public: the image of a product on the shop, 404 for any other.
export const Route = createFileRoute("/shop/img/$productId")({
  server: {
    handlers: {
      GET: ({ params }) => readImage(params.productId, true),
    },
  },
});
