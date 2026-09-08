/**
 * Ephemerality guard for the private 1-to-1 chat (Watch Together room).
 *
 * The whole session lifecycle is boundary-controlled by a heartbeat sweep so
 * that a silently-dead browser can never leave a session alive forever AND a
 * live/reconnecting room is never reaped. This module is the PURE decision
 * function (no sockets, no time source) so the exact sweep behaviour is unit
 * testable without booting the server.
 *
 * Rules (all bounded by `heartbeatWindowMs`, the silent-stale window):
 *   • A participant WITH a connected member is stale only when their member
 *     heartbeats have gone silent.
 *   • A participant WITHOUT a connected member is stale only when the session
 *     has had ZERO connected members for the full window. The grace is anchored
 *     at `lastMemberLeftAt` (when the last member disconnected) or `createdAt`
 *     (a brand-new session REST-created before ANY browser socket joined) —
 *     whichever is later. This is what keeps a "newly created session" and its
 *     post-disconnect reconnect window from being deleted before both clients
 *     have had time to join.
 *   • "Sweepable" (true) means EVERY participant is stale → the session can be
 *     destroyed.
 */
export interface PrivateSessionSweepArgs {
  participants: string[];
  /** uid → last heartbeat time of its CURRENT connected member (0/absent = no
   *  member connected). Mirrors `PrivateSession.members` on the server. */
  members: ReadonlyMap<string, number>;
  createdAt: number;
  lastMemberLeftAt?: number;
  now: number;
  heartbeatWindowMs: number;
}

export const privateSessionSweepable = (args: PrivateSessionSweepArgs): boolean =>
  args.participants.every((participantUid) => {
    const lastHeartbeatAt = args.members.get(participantUid);
    if (lastHeartbeatAt !== undefined) {
      return args.now - lastHeartbeatAt > args.heartbeatWindowMs;
    }
    // No member connected for this side — anchor the grace at the moment the
    // last member left (or session creation when nobody ever joined).
    const baseline = args.lastMemberLeftAt ?? args.createdAt;
    return args.now - baseline > args.heartbeatWindowMs;
  });