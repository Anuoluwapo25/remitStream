"use client";

// Client-side crypto for claim links: generate a random secret, hash it for
// the contract, and encode/decode it for a shareable URL.
//
// The raw secret never touches the contract or any server — only its sha256
// hash does, and only at creation time. The secret itself lives in the URL
// *fragment* (the part after "#"), which browsers never send to a server on
// a normal navigation, so it never ends up in a server log either. Whoever
// opens the finished link reads it straight out of `window.location.hash`.

import { Buffer } from "buffer";

const SECRET_BYTES = 16;

/** A fresh random secret, and the sha256 hash the contract is created with. */
export async function generateSecret(): Promise<{ secret: Uint8Array; hash: Buffer }> {
  const secret = new Uint8Array(SECRET_BYTES);
  crypto.getRandomValues(secret);
  const digest = await crypto.subtle.digest("SHA-256", secret);
  return { secret, hash: Buffer.from(digest) };
}

function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  return new Uint8Array(Buffer.from(padded, "base64"));
}

/** Build the shareable link for a just-created claim. */
export function claimLinkUrl(id: bigint | number | string, secret: Uint8Array): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/claim/${id}#${toBase64Url(secret)}`;
}

/** Read the secret out of the current page's URL fragment, if present. */
export function secretFromLocationHash(): Uint8Array | null {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) return null;
  try {
    const bytes = fromBase64Url(hash);
    return bytes.length > 0 ? bytes : null;
  } catch {
    return null;
  }
}
