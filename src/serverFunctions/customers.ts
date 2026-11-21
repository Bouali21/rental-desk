import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import * as customers from "@/server/customers";
import { getSettings } from "@/server/settings";
import { viewerMiddleware } from "@/server/viewerMiddleware";

export const listCustomers = createServerFn()
  .middleware([viewerMiddleware])
  .validator((data: unknown) => customers.listCustomersInput.parse(data))
  .handler(({ data }) => customers.listCustomers(data));

export const getCustomer = createServerFn()
  .middleware([viewerMiddleware])
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).strict().parse(data))
  .handler(async ({ data, context }) => ({
    customer: await customers.getCustomer(context.viewer, data.id),
    currency: (await getSettings()).currency,
  }));

export const createCustomer = createServerFn({ method: "POST" })
  .middleware([viewerMiddleware])
  .validator((data: unknown) => customers.customerInput.parse(data))
  .handler(({ data }) => customers.createCustomer(data));

export const updateCustomer = createServerFn({ method: "POST" })
  .middleware([viewerMiddleware])
  .validator((data: unknown) => customers.updateCustomerInput.parse(data))
  .handler(({ data }) => customers.updateCustomer(data));

export const setCustomerArchived = createServerFn({ method: "POST" })
  .middleware([viewerMiddleware])
  .validator((data: unknown) => customers.archiveCustomerInput.parse(data))
  .handler(({ data }) => customers.setCustomerArchived(data));
