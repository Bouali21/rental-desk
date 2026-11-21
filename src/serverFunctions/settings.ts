import { createServerFn } from "@tanstack/react-start";
import * as settings from "@/server/settings";
import { requireAdmin } from "@/server/viewer";
import { viewerMiddleware } from "@/server/viewerMiddleware";

export const getSettings = createServerFn()
  .middleware([viewerMiddleware])
  .handler(async ({ context }) => ({
    settings: await settings.getSettings(),
    admin: context.viewer.admin,
  }));

export const saveSettings = createServerFn({ method: "POST" })
  .middleware([viewerMiddleware])
  .validator((data: unknown) => settings.settingsInput.parse(data))
  .handler(({ data, context }) => {
    requireAdmin(context.viewer);
    return settings.saveSettings(data);
  });
