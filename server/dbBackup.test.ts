import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import { createStudioAdminSessions } from "../studioAdminSession";
import { createDatabaseBackupHandler } from "./dbBackup";

test("database export serves only a current signed Owner session", async t => {
  let clock = 0;
  const credentials = new Map([
    ["synthetic-owner", "synthetic-owner-credential"],
    ["synthetic-staff", "synthetic-staff-credential"],
  ]);
  const sessions = createStudioAdminSessions("synthetic-backup-test-signing-key", () => clock);
  const owner = sessions.issue("synthetic-owner", credentials.get("synthetic-owner")!);
  const staff = sessions.issue("synthetic-staff", credentials.get("synthetic-staff")!);
  const snapshot = {
    admins: [{ username: "synthetic-owner" }],
    continueWatching: { visitor: { movie: 42 } },
    appSnapshots: [{ id: "synthetic-snapshot" }],
  };
  let snapshotReads = 0;
  const app = express();
  app.get("/api/admin/db-backup", createDatabaseBackupHandler({
    resolveSignedIdentity: req => sessions.verify(
      (req.get("Cookie") || "").replace(/^test_session=/, ""),
      username => credentials.get(username) ?? null,
    ),
    isOwner: username => username === "synthetic-owner",
    readSnapshot: () => {
      snapshotReads++;
      return snapshot;
    },
  }));

  const server = app.listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/admin/db-backup`;
    const get = (session?: string, site = "same-origin") => fetch(url, {
      headers: { "Sec-Fetch-Site": site, ...(session ? { Cookie: `test_session=${session}` } : {}) },
    });

    await t.test("signed Owner receives the exact attachment with no-store headers", async () => {
      const response = await get(owner);
      assert.equal(response.status, 200);
      assert.match(response.headers.get("content-disposition") ?? "", /attachment;.*cinemachat-db-backup\.json/);
      assert.match(response.headers.get("content-type") ?? "", /^application\/json/);
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      assert.equal(response.headers.get("cross-origin-resource-policy"), "same-origin");
      assert.deepEqual(await response.json(), snapshot);
    });
    await t.test("an unsigned request and a damaged session cannot read data", async () => {
      for (const session of [undefined, `${owner}damaged`]) {
        const response = await get(session);
        assert.equal(response.status, 401);
        assert.equal(response.headers.has("content-disposition"), false);
      }
    });
    await t.test("a signed non-Owner and a cross-origin request are denied", async () => {
      assert.equal((await get(staff)).status, 403);
      assert.equal((await get(owner, "cross-site")).status, 403);
    });
    await t.test("expired sessions and sessions invalidated by credential changes are denied", async () => {
      credentials.set("synthetic-owner", "changed-credential");
      assert.equal((await get(owner)).status, 401);
      const fresh = sessions.issue("synthetic-owner", credentials.get("synthetic-owner")!);
      clock += 12 * 60 * 60_000;
      assert.equal((await get(fresh)).status, 401);
    });
    assert.equal(snapshotReads, 1);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
