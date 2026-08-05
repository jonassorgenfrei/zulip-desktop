import {shell} from "electron/common";
import {spawn} from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

import * as ConfigUtil from "./config-util.ts";
import {Html, html} from "./html.ts";
import * as t from "./translation-util.ts";

const whitelistedProtocols = ConfigUtil.getConfigItemWithoutSettingDefault(
  "whitelistedProtocols",
  ["http:", "https:", "mailto:", "tel:", "sip:"],
);

const protocolsHandledReliablyByShell = new Set([
  "http:",
  "https:",
  "mailto:",
  "tel:",
  "sip:",
]);

function openCustomProtocol(url: URL): void {
  if (process.platform === "linux") {
    const child = spawn("xdg-open", [url.href], {
      detached: true,
      stdio: "ignore",
    });
    child.on("error", (error) => {
      console.error("[protocol] xdg-open failed", {href: url.href, error});
    });
    child.unref();
    return;
  }

  if (process.platform === "win32") {
    const child = spawn("cmd.exe", ["/c", "start", "", url.href], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.on("error", (error) => {
      console.error("[protocol] start failed", {href: url.href, error});
    });
    child.unref();
    return;
  }
}

export async function openBrowser(url: URL): Promise<void> {
  if (whitelistedProtocols.includes(url.protocol)) {
    if (!protocolsHandledReliablyByShell.has(url.protocol)) {
      openCustomProtocol(url);
      if (process.platform === "linux" || process.platform === "win32") {
        return;
      }
    }

    await shell.openExternal(url.href);
  } else {
    // For security, indirect links to non-whitelisted protocols
    // through a real web browser via a local HTML file.
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "zulip-redirect-"));
    const file = path.join(directory, "redirect.html");
    fs.writeFileSync(
      file,
      html`
        <!doctype html>
        <html>
          <head>
            <meta charset="UTF-8" />
            <meta http-equiv="Refresh" content="0; url=${url.href}" />
            <title>${t.__("Redirecting")}</title>
            <style>
              html {
                font-family: menu, "Helvetica Neue", sans-serif;
              }
            </style>
          </head>
          <body>
            <p>
              ${new Html({
                html: t.__("Opening {{{link}}}…", {
                  link: html`<a href="${url.href}">${url.href}</a>`.html,
                }),
              })}
            </p>
          </body>
        </html>
      `.html,
    );
    await shell.openPath(file);
    setTimeout(() => {
      fs.unlinkSync(file);
      fs.rmdirSync(directory);
    }, 15_000);
  }
}
