/**
 * MSW server for Jest/Vitest. Intercepts http/https in Node.
 * In tests: beforeAll(() => server.listen()), afterEach(() => server.resetHandlers()), afterAll(() => server.close()).
 */

import { setupServer } from "msw/node";
import { handlers } from "./handlers";

export const server = setupServer(...handlers);
