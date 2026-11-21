import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { availabilityGrid } from "@/server/availability";
import * as products from "@/server/products";
import { getSettings } from "@/server/settings";
import { requireAdmin } from "@/server/viewer";
import { viewerMiddleware } from "@/server/viewerMiddleware";

export const listProducts = createServerFn()
  .middleware([viewerMiddleware])
  .validator((data: unknown) => z.object({ q: z.string().max(200) }).parse(data))
  .handler(async ({ data, context }) => ({
    products: await products.listProducts(data.q),
    currency: (await getSettings()).currency,
    admin: context.viewer.admin,
  }));

export const getProduct = createServerFn()
  .middleware([viewerMiddleware])
  .validator((data: unknown) => products.idInput.parse(data))
  .handler(async ({ data, context }) => ({
    product: await products.getProduct(data.id),
    currency: (await getSettings()).currency,
    admin: context.viewer.admin,
  }));

export const createProduct = createServerFn({ method: "POST" })
  .middleware([viewerMiddleware])
  .validator((data: unknown) => products.createProductInput.parse(data))
  .handler(({ data, context }) => {
    requireAdmin(context.viewer);
    return products.createProduct(data);
  });
export const updateProductDetails = createServerFn({ method: "POST" })
  .middleware([viewerMiddleware])
  .validator((data: unknown) => products.productDetailsInput.parse(data))
  .handler(({ data, context }) => {
    requireAdmin(context.viewer);
    return products.updateDetails(data);
  });
export const updateProductPricing = createServerFn({ method: "POST" })
  .middleware([viewerMiddleware])
  .validator((data: unknown) => products.pricingInput.parse(data))
  .handler(({ data, context }) => {
    requireAdmin(context.viewer);
    return products.updatePricing(data);
  });
export const setProductQuantity = createServerFn({ method: "POST" })
  .middleware([viewerMiddleware])
  .validator((data: unknown) => products.quantityInput.parse(data))
  .handler(({ data, context }) => {
    requireAdmin(context.viewer);
    return products.setQuantity(data);
  });
export const addStockItem = createServerFn({ method: "POST" })
  .middleware([viewerMiddleware])
  .validator((data: unknown) => products.addItemInput.parse(data))
  .handler(({ data, context }) => {
    requireAdmin(context.viewer);
    return products.addItem(data);
  });
export const setStockItemRetired = createServerFn({ method: "POST" })
  .middleware([viewerMiddleware])
  .validator((data: unknown) => products.itemInput.parse(data))
  .handler(({ data, context }) => {
    requireAdmin(context.viewer);
    return products.setItemRetired(data);
  });
export const setProductArchived = createServerFn({ method: "POST" })
  .middleware([viewerMiddleware])
  .validator((data: unknown) => products.archiveInput.parse(data))
  .handler(({ data, context }) => {
    requireAdmin(context.viewer);
    return products.setArchived(data);
  });

const range = z
  .object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })
  .strict();

export const getAvailability = createServerFn()
  .middleware([viewerMiddleware])
  .validator((data: unknown) => range.parse(data))
  .handler(({ data }) => {
    const from = Date.parse(`${data.from}T00:00:00Z`);
    const to = Date.parse(`${data.to}T00:00:00Z`);
    if (to < from) throw new Error("The end date is before the start date.");
    return availabilityGrid(from, to);
  });
