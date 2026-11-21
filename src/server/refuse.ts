import { setResponseStatus } from "@tanstack/react-start/server";

/** Throws a message for the person, with the HTTP status a server function answers with. */
export function refuse(status: 400 | 403 | 404 | 409, message: string): never {
  try {
    setResponseStatus(status);
  } catch {
    // Outside a server function (an AI tool call): the message is enough.
  }
  throw new Error(message);
}
