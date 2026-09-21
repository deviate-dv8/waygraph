import { test, expect } from "@playwright/test";
import { spawnSync } from "node:child_process";
import net from "node:net";
import { MemPage, checkpoint } from "waygraph";
import { mailVerifyFlow } from "../src/flows/mail-verify.flow.js";
import { ExpectedRecipient, ExpectedLinkPattern, ExpectedEmailContent } from "../src/states/demo.mem-keys.js";
import { HOME_URL } from "../src/map/(app_base)/home/_sel.js";

/**
 * This scaffold has no real backend, so these tests play the role of "the
 * app sent a verification email" themselves: spin up a real, throwaway
 * Mailpit container, send a real SMTP message, then run mailVerifyFlow for
 * real - a real cross-origin browser hop into Mailpit's own web UI and
 * back, no mail-catcher REST API anywhere. Covers the happy path, both
 * failure paths its QA-facing asserts exist for (no email arrived, wrong
 * content), and - the actual point of making the mail-reading Blocks
 * mem-driven - a second, entirely different email scenario running through
 * the exact same four Blocks with zero new code.
 */

function runMailpit(): { containerId: string; smtpPort: number; httpPort: number } {
  const run = spawnSync("docker", ["run", "--rm", "-d", "-p", "0:1025", "-p", "0:8025", "axllent/mailpit"], {
    encoding: "utf8",
  });
  if (run.status !== 0) throw new Error(`docker run axllent/mailpit failed: ${run.stderr || run.stdout}`);
  const containerId = run.stdout.trim();
  const portCheck = spawnSync("docker", ["port", containerId], { encoding: "utf8" });
  const portFor = (containerPort: number) => {
    const line = portCheck.stdout.split("\n").find((l) => l.startsWith(`${containerPort}/tcp`) && l.includes("0.0.0.0"));
    const m = line?.match(/:(\d+)\s*$/);
    if (!m) throw new Error(`could not determine host port for ${containerPort}`);
    return Number(m[1]);
  };
  return { containerId, smtpPort: portFor(1025), httpPort: portFor(8025) };
}

function dockerAvailable(): boolean {
  return spawnSync("docker", ["ps"], { encoding: "utf8" }).status === 0;
}

async function sendTestEmail(opts: { host: string; port: number; to: string; subject: string; html: string }): Promise<void> {
  const body = [
    "From: scaffold-app@example.com",
    `To: ${opts.to}`,
    `Subject: ${opts.subject}`,
    "Content-Type: text/html; charset=utf-8",
    "",
    opts.html,
    ".",
  ].join("\r\n");

  await new Promise<void>((resolve, reject) => {
    const socket = net.createConnection({ host: opts.host, port: opts.port });
    function cmd(line: string): Promise<string> {
      return new Promise((res) => {
        socket.once("data", (d) => res(d.toString()));
        socket.write(line + "\r\n");
      });
    }
    socket.once("error", reject);
    socket.once("connect", () => {
      (async () => {
        await new Promise<void>((r) => socket.once("data", () => r()));
        await cmd("HELO localhost");
        await cmd("MAIL FROM:<scaffold-app@example.com>");
        await cmd(`RCPT TO:<${opts.to}>`);
        await cmd("DATA");
        await cmd(body);
        await cmd("QUIT");
        socket.end();
        resolve();
      })().catch(reject);
    });
  });
}

async function withMailpit<T>(fn: (opts: { httpPort: number; smtpPort: number }) => Promise<T>): Promise<T> {
  const { containerId, smtpPort, httpPort } = runMailpit();
  const originalMailUrl = process.env.WAYGRAPH_MAIL_URL;
  try {
    process.env.WAYGRAPH_MAIL_URL = `http://127.0.0.1:${httpPort}`;
    return await fn({ httpPort, smtpPort });
  } finally {
    if (originalMailUrl === undefined) delete process.env.WAYGRAPH_MAIL_URL;
    else process.env.WAYGRAPH_MAIL_URL = originalMailUrl;
    spawnSync("docker", ["stop", containerId]);
  }
}

const VERIFICATION_CONTENT = "Please confirm your email address to finish setting up your account.";

test("mailVerifyFlow: confirms arrival, confirms content, reads the real link, navigates to it", async ({
  context,
}) => {
  test.skip(!dockerAvailable(), "Docker not reachable in this environment");
  test.setTimeout(60_000);

  await withMailpit(async ({ smtpPort }) => {
    const recipient = "demo-user@example.com";
    await sendTestEmail({
      host: "127.0.0.1",
      port: smtpPort,
      to: recipient,
      subject: "Please verify your account",
      html: `<p>${VERIFICATION_CONTENT}</p><a href="${HOME_URL}?verified=1">Verify your account</a>`,
    });

    const mem = new MemPage();
    mem.set(ExpectedRecipient({ email: recipient }));
    mem.set(ExpectedLinkPattern, "verified=1");
    mem.set(ExpectedEmailContent, VERIFICATION_CONTENT);
    const result = await mailVerifyFlow.run(context, mem);
    expect(result).toEqual(checkpoint("HomeVerified"));
  });
});

test("the same four mail-reading Blocks handle a second, unrelated email scenario - zero new Blocks", async ({
  context,
}) => {
  test.skip(!dockerAvailable(), "Docker not reachable in this environment");
  test.setTimeout(60_000);

  await withMailpit(async ({ smtpPort }) => {
    const recipient = "password-reset-user@example.com";
    const resetContent = "We received a request to reset your password.";
    await sendTestEmail({
      host: "127.0.0.1",
      port: smtpPort,
      to: recipient,
      subject: "Reset your password",
      // A decoy link comes first - proves ExpectedLinkPattern actually
      // discriminates between two links in the body, not just "the first one".
      html: `<p>${resetContent}</p>
             <a href="https://example.com/report-abuse?ref=xyz">Not you? Report this</a>
             <a href="${HOME_URL}?verified=1">Reset your password</a>`,
    });

    const mem = new MemPage();
    mem.set(ExpectedRecipient({ email: recipient }));
    mem.set(ExpectedLinkPattern, "verified=1");
    mem.set(ExpectedEmailContent, resetContent);
    const result = await mailVerifyFlow.run(context, mem);
    expect(result).toEqual(checkpoint("HomeVerified"));
  });
});

test("assert-email-received fails loud, naming itself, when no email ever arrives", async ({ context }) => {
  test.skip(!dockerAvailable(), "Docker not reachable in this environment");
  test.setTimeout(30_000);

  await withMailpit(async () => {
    const mem = new MemPage();
    mem.set(ExpectedRecipient({ email: "nobody-sent-this-one@example.com" }));
    mem.set(ExpectedLinkPattern, "verified=1");
    mem.set(ExpectedEmailContent, VERIFICATION_CONTENT);
    // A defineFlow chain's verify-failure error names the whole path taken so
    // far (each composed Block's own name accumulates through connect()),
    // not just the leaf Block - real, useful QA context, not a bug - so this
    // matches the accumulated name ending at assert-email-received, not an
    // exact "failed after \"assert-email-received\"" alone.
    await expect(mailVerifyFlow.run(context, mem)).rejects.toThrow(
      /trait "email-received" failed after ".*assert-email-received"/,
    );
  });
});

test("assert-email-content fails loud, naming itself, when the email's copy doesn't match", async ({ context }) => {
  test.skip(!dockerAvailable(), "Docker not reachable in this environment");
  test.setTimeout(60_000);

  await withMailpit(async ({ smtpPort }) => {
    const recipient = "demo-user@example.com";
    await sendTestEmail({
      host: "127.0.0.1",
      port: smtpPort,
      to: recipient,
      subject: "Please verify your account",
      // A real link is present (so this isolates the content check, not the
      // link-extraction step), but the surrounding copy is wrong.
      html: `<p>Your package has shipped!</p><a href="${HOME_URL}?verified=1">Track it</a>`,
    });

    const mem = new MemPage();
    mem.set(ExpectedRecipient({ email: recipient }));
    mem.set(ExpectedLinkPattern, "verified=1");
    mem.set(ExpectedEmailContent, VERIFICATION_CONTENT);
    await expect(mailVerifyFlow.run(context, mem)).rejects.toThrow(
      /trait "body-contains-expected-text" failed after ".*assert-email-content"/,
    );
  });
});
