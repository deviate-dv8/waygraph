// A session's live feed (`subscribe`): every run event in the session (steps, reads) and the snapshot after each change,
// as JSON lines to every subscribed socket. Waygraph UI watches a session through it; `pilot watch <id>` prints it.
import { connect, type Socket } from "node:net";
import { onRunEvent } from "../../engine/run/events.js";
import { resolveSessionMeta } from "./files.js";
import type { SessionStreamMessage } from "./protocol.js";
import { SESSION_PROTOCOL_VERSION } from "./protocol.js";

/** The server side: subscribed sockets, fed every run event in this process until `close`. */
export function createFeed(): { add(sock: Socket): void; send(message: SessionStreamMessage): void; close(): void } {
  const subscribers = new Set<Socket>();
  const send = (message: SessionStreamMessage): void => {
    const line = JSON.stringify(message) + "\n";
    for (const sock of subscribers) if (!sock.destroyed) sock.write(line);
  };
  const off = onRunEvent((event) => send({ type: "event", event }));
  return {
    add(sock) {
      subscribers.add(sock);
      sock.on("close", () => subscribers.delete(sock));
      sock.write(JSON.stringify({ ok: true, protocol: SESSION_PROTOCOL_VERSION }) + "\n");
    },
    send,
    close() {
      off();
      for (const sock of subscribers) sock.end();
      subscribers.clear();
    },
  };
}

/**
 * The client side: subscribes to a running session and calls `onMessage` for each line until `close()` (or the session
 * ends). Rejects when the session is unknown or does not answer the subscribe.
 */
export function subscribeSession(
  projectDir: string,
  sessionId: string,
  onMessage: (message: SessionStreamMessage) => void,
  timeoutMs = 15_000,
): Promise<{ close(): void; closed: Promise<void> }> {
  const meta = resolveSessionMeta(sessionId, projectDir);
  if (!meta) return Promise.reject(new Error(`no such session "${sessionId}" - \`waygraph pilot sessions\` lists live ids`));
  return new Promise((resolve, reject) => {
    const sock = connect(meta.socketPath);
    const timer = setTimeout(() => {
      sock.destroy();
      reject(new Error(`session "${sessionId}" did not answer subscribe within ${timeoutMs}ms`));
    }, timeoutMs);
    const closed = new Promise<void>((done) => sock.on("close", () => done()));
    let buf = "";
    let acked = false;
    sock.on("connect", () => sock.write(JSON.stringify({ op: "subscribe" }) + "\n"));
    sock.on("error", (err) => {
      clearTimeout(timer);
      if (!acked) reject(err);
    });
    sock.on("data", (chunk: Buffer) => {
      buf += chunk.toString("utf-8");
      let nl: number;
      while ((nl = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        if (!acked) {
          acked = true;
          clearTimeout(timer);
          resolve({ close: () => sock.end(), closed });
          continue;
        }
        onMessage(JSON.parse(line) as SessionStreamMessage);
      }
    });
  });
}
