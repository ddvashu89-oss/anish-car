import { jwtVerify, SignJWT } from "jose";

export const SESSION_COOKIE = "acr_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export type SessionPayload = {
  sid: string;
  uid: number;
};

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET is not set — check your .env file.");
  return new TextEncoder().encode(value);
}

export async function signSessionToken(payload: SessionPayload) {
  return new SignJWT({ uid: payload.uid })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sid)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secret());
}

/** Signature-only check. Safe to call from middleware; does not prove the session still exists. */
export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.sub || typeof payload.uid !== "number") return null;
    return { sid: payload.sub, uid: payload.uid };
  } catch {
    return null;
  }
}
