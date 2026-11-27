import type { Request, RequestHandler } from "express";

type BackupAccess = {
  resolveSignedIdentity(request: Request): string | null;
  isOwner(username: string): boolean;
  readSnapshot(): unknown;
};

export function createDatabaseBackupHandler(access: BackupAccess): RequestHandler {
  return (request, response) => {
    response.set({
      "Cache-Control": "private, no-store",
      "Cross-Origin-Resource-Policy": "same-origin",
      "X-Content-Type-Options": "nosniff",
    });

    const fetchSite = request.get("Sec-Fetch-Site");
    if (fetchSite && fetchSite !== "same-origin") {
      response.status(403).json({ success: false, error: "Same-origin request required" });
      return;
    }

    const identity = access.resolveSignedIdentity(request);
    if (!identity) {
      response.status(401).json({ success: false, error: "Owner sign-in required" });
      return;
    }
    if (!access.isOwner(identity)) {
      response.status(403).json({ success: false, error: "Owner access required" });
      return;
    }

    let payload: string | undefined;
    try {
      payload = JSON.stringify(access.readSnapshot(), null, 2);
    } catch {
      // Do not log or return any part of the database.
    }
    if (payload === undefined) {
      response.status(500).json({ success: false, error: "Database backup unavailable" });
      return;
    }

    response.attachment("cinamachat-db-backup.json");
    response.type("application/json");
    response.end(payload);
  };
}
