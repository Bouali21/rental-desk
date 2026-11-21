import { createServerFn } from "@tanstack/react-start";
import { activeCustomers } from "@/server/customers";
import * as orders from "@/server/orders";
import { orderableProducts } from "@/server/products";
import { getSettings } from "@/server/settings";
import { viewerMiddleware } from "@/server/viewerMiddleware";

export const listOrders = createServerFn()
  .middleware([viewerMiddleware])
  .validator((data: unknown) => orders.listOrdersInput.parse(data))
  .handler(async ({ data, context }) => ({
    orders: await orders.listOrders(context.viewer, data),
    customers: await activeCustomers(),
    currency: (await getSettings()).currency,
  }));

export const getPlanner = createServerFn()
  .middleware([viewerMiddleware])
  .handler(async ({ context }) => ({
    planner: await orders.planner(context.viewer),
    currency: (await getSettings()).currency,
  }));

export const getOrder = createServerFn()
  .middleware([viewerMiddleware])
  .validator((data: unknown) => orders.idInput.parse(data))
  .handler(async ({ data, context }) => ({
    order: await orders.getOrder(context.viewer, data.id),
    products: await orderableProducts(),
    settings: await getSettings(),
  }));

export const getPickupOptions = createServerFn()
  .middleware([viewerMiddleware])
  .validator((data: unknown) => orders.idInput.parse(data))
  .handler(({ data, context }) => orders.pickupOptions(context.viewer, data.id));

export const createOrder = createServerFn({ method: "POST" })
  .middleware([viewerMiddleware])
  .validator((data: unknown) => orders.createOrderInput.parse(data))
  .handler(({ data, context }) => orders.createOrder(context.viewer, data));
export const updateOrderPeriod = createServerFn({ method: "POST" })
  .middleware([viewerMiddleware])
  .validator((data: unknown) => orders.periodInput.parse(data))
  .handler(({ data, context }) => orders.updatePeriod(context.viewer, data));
export const addOrderLine = createServerFn({ method: "POST" })
  .middleware([viewerMiddleware])
  .validator((data: unknown) => orders.addLineInput.parse(data))
  .handler(({ data, context }) => orders.addLine(context.viewer, data));
export const updateOrderLine = createServerFn({ method: "POST" })
  .middleware([viewerMiddleware])
  .validator((data: unknown) => orders.lineInput.parse(data))
  .handler(({ data, context }) => orders.updateLine(context.viewer, data));
export const removeOrderLine = createServerFn({ method: "POST" })
  .middleware([viewerMiddleware])
  .validator((data: unknown) => orders.removeLineInput.parse(data))
  .handler(({ data, context }) => orders.removeLine(context.viewer, data));
export const setOrderDiscount = createServerFn({ method: "POST" })
  .middleware([viewerMiddleware])
  .validator((data: unknown) => orders.discountInput.parse(data))
  .handler(({ data, context }) => orders.setDiscount(context.viewer, data));
export const changeOrderStatus = createServerFn({ method: "POST" })
  .middleware([viewerMiddleware])
  .validator((data: unknown) => orders.transitionInput.parse(data))
  .handler(({ data, context }) => orders.transition(context.viewer, data));
export const pickUpOrder = createServerFn({ method: "POST" })
  .middleware([viewerMiddleware])
  .validator((data: unknown) => orders.pickupInput.parse(data))
  .handler(({ data, context }) => orders.pickUp(context.viewer, data));
export const deleteDraftOrder = createServerFn({ method: "POST" })
  .middleware([viewerMiddleware])
  .validator((data: unknown) => orders.idInput.parse(data))
  .handler(({ data, context }) => orders.deleteDraft(context.viewer, data.id));
export const recordPayment = createServerFn({ method: "POST" })
  .middleware([viewerMiddleware])
  .validator((data: unknown) => orders.paymentInput.parse(data))
  .handler(({ data, context }) => orders.recordPayment(context.viewer, data));
export const deletePayment = createServerFn({ method: "POST" })
  .middleware([viewerMiddleware])
  .validator((data: unknown) => orders.deletePaymentInput.parse(data))
  .handler(({ data, context }) => orders.deletePayment(context.viewer, data.id));
