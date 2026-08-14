import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import { database } from "./database.js";

export type StoredUpload = {
  id: string;
  storageKey: string;
  sha256: string;
  sizeBytes: number;
};

function safeExtension(filename: string): string {
  const extension = path.extname(filename).toLowerCase();
  return [".pdf", ".docx", ".txt", ".md"].includes(extension) ? extension : ".bin";
}

export async function storeUpload(input: {
  ownerId: string;
  purpose: "candidate-resume" | "recruiter-resume";
  resourceId: string;
  originalName: string;
  mimeType?: string;
  buffer: Buffer;
}): Promise<StoredUpload> {
  const id = crypto.randomUUID();
  const directory = path.join(config.uploadDir, input.purpose);
  const storageKey = path.posix.join(input.purpose, `${id}${safeExtension(input.originalName)}`);
  const destination = path.join(config.uploadDir, storageKey);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  await fs.writeFile(destination, input.buffer, { mode: 0o600, flag: "wx" });
  const sha256 = crypto.createHash("sha256").update(input.buffer).digest("hex");
  database.recordUploadedFile({
    id,
    ownerId: input.ownerId,
    purpose: input.purpose,
    resourceId: input.resourceId,
    originalName: path.basename(input.originalName),
    storageKey,
    mimeType: input.mimeType || "application/octet-stream",
    sizeBytes: input.buffer.byteLength,
    sha256,
  });
  return { id, storageKey, sha256, sizeBytes: input.buffer.byteLength };
}

export async function deleteStoredResource(ownerId: string, resourceId: string) {
  const files = database.uploadedFilesForResource(ownerId, resourceId);
  for (const file of files) {
    const target = path.resolve(config.uploadDir, file.storageKey);
    const root = `${path.resolve(config.uploadDir)}${path.sep}`;
    if (!target.startsWith(root)) throw new Error("拒绝删除上传目录之外的文件");
    await fs.unlink(target).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
    database.markUploadedFileDeleted(file.id);
  }
  return files.length;
}

export async function readStoredResource(ownerId: string, resourceId: string) {
  const file = database.uploadedFileForResource(ownerId, resourceId);
  if (!file) return undefined;
  const target = path.resolve(config.uploadDir, file.storageKey);
  const root = `${path.resolve(config.uploadDir)}${path.sep}`;
  if (!target.startsWith(root)) throw new Error("拒绝读取上传目录之外的文件");
  const buffer = await fs.readFile(target);
  return { ...file, buffer };
}
