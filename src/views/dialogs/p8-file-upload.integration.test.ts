// P8 live-server integration test (plan §9 P8: "upload posts to live server
// (integration, then deletes the file)").
//
// Exercises the file endpoints the upload dialog drives — POST /metamodel/files,
// GET /metamodel/files/:uuid, PATCH /metamodel/files/:uuid, DELETE — and pins down the
// RESPONSE SHAPE the dialog depends on (`response.uuid`), which the old generated
// fetchHelper mistyped as `Promise<string>` for PATCH.
//
// The demo metamodel has NO attribute of the File attribute type (verified in P8 across
// all 8 scene types), so there is no attribute instance to hang a real upload off; the
// endpoints themselves are what this test can prove. Self-cleaning: every file it
// creates is deleted in a `finally`.
//
// Runs against the in-container REST API at http://mmar-server:8000 (localhost:8000 does
// NOT resolve in-container); skipped gracefully when the server is down.
import { describe, it, expect } from "vitest";

const SERVER = "http://mmar-server:8000";

async function serverReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${SERVER}/`, { method: "GET", signal: AbortSignal.timeout(2000) });
    return res.status > 0;
  } catch {
    return false;
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const loginRes = await fetch(`${SERVER}/login/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ username: "admin", password: "admin" }),
  });
  const token: string = JSON.parse(await loginRes.text());
  return { Accept: "application/json", authorization: `Bearer ${token}` };
}

/** Same multipart body the backend-service builds (FormData with a single `file`). */
function formDataFor(name: string, content: string, type: string): FormData {
  const formData = new FormData();
  formData.append("file", new File([content], name, { type }));
  return formData;
}

const isUp = await serverReachable();
if (!isUp) {
  console.warn(`[p8-file-upload.integration] ${SERVER} unreachable — skipping live upload tests`);
}

describe.skipIf(!isUp)("P8 file upload (live server)", () => {
  it("POSTs a file, GETs it back, PATCHes it and DELETEs it", async () => {
    const headers = await authHeaders();
    let uuid: string | undefined;

    try {
      // --- POST: what UploadFileDialog does for a fresh attribute ---------------
      const postRes = await fetch(`${SERVER}/metamodel/files`, {
        method: "POST",
        headers,
        body: formDataFor("p8-upload-test.txt", "hello from P8", "text/plain"),
      });
      expect(postRes.ok).toBe(true);
      const posted = await postRes.json();

      // The dialog reads `response.uuid` — assert the server really sends it.
      uuid = posted.uuid;
      expect(typeof uuid).toBe("string");
      expect(uuid).toMatch(/^[0-9a-f-]{36}$/i);

      // --- GET: what deleteFile/downloadFile fall back to ----------------------
      const getRes = await fetch(`${SERVER}/metamodel/files/${uuid}`, { method: "GET", headers });
      expect(getRes.ok).toBe(true);
      expect(await getRes.text()).toContain("hello from P8");

      // --- PATCH: what the dialog does when the attribute already holds a uuid --
      const patchRes = await fetch(`${SERVER}/metamodel/files/${uuid}`, {
        method: "PATCH",
        headers,
        body: formDataFor("p8-upload-test.txt", "replaced by P8", "text/plain"),
      });
      expect(patchRes.ok).toBe(true);
      const patched = await patchRes.json();
      // fetchHelper types this `Promise<string>`, but the dialog reads `.uuid` off it —
      // confirm which is true of the real server.
      expect(patched.uuid).toBe(uuid);

      const afterPatch = await fetch(`${SERVER}/metamodel/files/${uuid}`, { method: "GET", headers });
      expect(await afterPatch.text()).toContain("replaced by P8");
    } finally {
      // --- DELETE: what deleteFile does; also our cleanup ---------------------
      if (uuid) {
        const deleteRes = await fetch(`${SERVER}/metamodel/files/${uuid}`, { method: "DELETE", headers });
        expect(deleteRes.ok).toBe(true);
        const gone = await fetch(`${SERVER}/metamodel/files/${uuid}`, { method: "GET", headers });
        expect(gone.ok).toBe(false);
      }
    }
  });
});
