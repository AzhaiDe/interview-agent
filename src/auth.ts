import crypto from "node:crypto";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { config } from "./config.js";

const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(48).toString("hex");
const BCRYPT_ROUNDS = 12;

export interface JwtPayload {
  userId: string;
  displayName: string;
}

export function generateAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "24h" });
}

export function verifyAccessToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Cookie name constant used by both server middleware and frontend logout logic
export const AUTH_COOKIE_NAME = "offerpilot-token";

// Cookie settings -- sameSite=lax prevents CSRF while allowing top-level navigation GET requests
// secure flag toggled based on env -- protects cookie over HTTPS in prod, allows HTTP in dev
// maxAge matches JWT expiry so the browser discards the cookie at the same time the token expires server-side
export function getCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: config.env === "production" || config.publicDemo,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours in ms
  };
}
