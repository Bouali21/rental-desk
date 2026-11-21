import { createFileRoute } from "@tanstack/react-router";
import { book, BookingError } from "@/server/shop";

// Public: a visitor's booking. Checks notice, products and availability itself.
export const Route = createFileRoute("/shop/api/book")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(request.headers.get("content-type") ?? "").includes("application/json"))
          return Response.json({ error: "Send JSON" }, { status: 415 });
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Send JSON" }, { status: 400 });
        }
        try {
          return Response.json(await book(body), { status: 201 });
        } catch (error) {
          if (error instanceof BookingError) return Response.json({ error: error.message }, { status: error.status });
          throw error;
        }
      },
    },
  },
});
