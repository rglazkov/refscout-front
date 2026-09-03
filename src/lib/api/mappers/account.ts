import { type AccountUser, type Session } from "@/lib/domain";
import {
  type SessionResponse as WireSession,
  type User as WireUser,
} from "@/lib/api/wire";

function toUser(w: WireUser): AccountUser {
  return {
    id: w.id,
    email: w.email,
    ...(w.name === undefined ? {} : { name: w.name }),
    createdAt: w.createdAt,
  };
}

export function toSession(w: WireSession): Session {
  return {
    user: w.user === null ? null : toUser(w.user),
    csrfToken: w.csrfToken,
  };
}
