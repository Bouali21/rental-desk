import { env } from "cloudflare:workers";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import {
  ConfigurationError,
  getEveryAppUser,
  gatewayUrl,
  isAdmin,
} from "@every-app/sdk/server";

/**
 * The Gateway's origin (the way back to the other apps, and the host the
 * light/dark cookie is set on) and whether the person is an admin. The shop's
 * pages load this too, for visitors the Gateway hasn't signed in: they get
 * neither.
 */
export const getGatewayUrl = createServerFn().handler(async () => {
  const user = await getEveryAppUser(getRequest(), env);
  if (!user) return { gatewayUrl: null, admin: false };
  try {
    return { gatewayUrl: new URL(gatewayUrl(env)).origin, admin: isAdmin(user) };
  } catch (error) {
    if (!(error instanceof ConfigurationError)) throw error;
    return { gatewayUrl: null, admin: isAdmin(user) };
  }
});
