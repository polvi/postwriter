---------------------------- MODULE Inbox ----------------------------
(* Post Writer delivery: a sent note is written to the recipient's device   *)
(* and acknowledged to the server exactly once, with the device write     *)
(* strictly before the ack. The plugin may crash at any point during a    *)
(* pull; the server's ack is a single conditional UPDATE                  *)
(* (delivered_at IS NULL), so a duplicate ack is a no-op.                 *)
(*                                                                        *)
(* Safety checked: a message is never acked without having been written  *)
(* on the recipient's device (no lost notes), and the server flips        *)
(* delivered exactly once (no double counting). Duplicate device files    *)
(* after a crash-before-ack are allowed and expected: the alternative,    *)
(* ack-then-write, loses notes.                                           *)
EXTENDS Naturals, FiniteSets

CONSTANTS Users, Msgs, MaxWrites

VARIABLES
  sent,       \* set of msgs the server holds
  to,         \* msg -> recipient
  delivered,  \* set of msgs the server has marked delivered
  device,     \* user -> bag of msgs written on their device (count per msg)
  pulling     \* user -> msg currently mid-pull (fetched, maybe written), or 0

vars == <<sent, to, delivered, device, pulling>>

None == 0

Init ==
  /\ sent = {}
  /\ to = [m \in Msgs |-> CHOOSE u \in Users : TRUE]
  /\ delivered = {}
  /\ device = [u \in Users |-> [m \in Msgs |-> 0]]
  /\ pulling = [u \in Users |-> None]

\* A sender posts a note for user u. The row is created once (INSERT OR IGNORE).
Send(m, u) ==
  /\ m \notin sent
  /\ sent' = sent \cup {m}
  /\ to' = [to EXCEPT ![m] = u]
  /\ UNCHANGED <<delivered, device, pulling>>

\* The recipient's plugin fetches an undelivered message body.
PullFetch(u, m) ==
  /\ pulling[u] = None
  /\ m \in sent /\ to[m] = u /\ m \notin delivered
  /\ pulling' = [pulling EXCEPT ![u] = m]
  /\ UNCHANGED <<sent, to, delivered, device>>

\* createNote + insertElements succeed: the note is on disk.
PullWrite(u) ==
  /\ pulling[u] # None
  /\ device[u][pulling[u]] < MaxWrites
  /\ device' = [device EXCEPT ![u][pulling[u]] = @ + 1]
  /\ UNCHANGED <<sent, to, delivered, pulling>>

\* POST /delivered after the write. Conditional UPDATE: idempotent.
PullAck(u) ==
  /\ pulling[u] # None
  /\ device[u][pulling[u]] > 0
  /\ delivered' = delivered \cup {pulling[u]}
  /\ pulling' = [pulling EXCEPT ![u] = None]
  /\ UNCHANGED <<sent, to, device>>

\* The plugin dies mid-pull (view closed, runtime killed, network gone).
\* Whatever was written stays on disk; the server still lists the message.
Crash(u) ==
  /\ pulling[u] # None
  /\ pulling' = [pulling EXCEPT ![u] = None]
  /\ UNCHANGED <<sent, to, delivered, device>>

Next ==
  \/ \E m \in Msgs, u \in Users : Send(m, u)
  \/ \E u \in Users, m \in Msgs : PullFetch(u, m)
  \/ \E u \in Users : PullWrite(u) \/ PullAck(u) \/ Crash(u)

Spec == Init /\ [][Next]_vars

-----------------------------------------------------------------------------
TypeOK ==
  /\ sent \subseteq Msgs
  /\ delivered \subseteq sent
  /\ \A u \in Users : pulling[u] \in Msgs \cup {None}

\* Every delivered message is on its recipient's device: the ack never
\* precedes the write, so a crash can never lose a note.
NoLostNotes ==
  \A m \in delivered : device[to[m]][m] >= 1

\* A note only ever lands on the device it was addressed to.
RightRecipient ==
  \A u \in Users, m \in Msgs : device[u][m] > 0 => (m \in sent /\ to[m] = u)

\* Once delivered, the message is never pulled again (the inbox query
\* filters delivered_at IS NULL): no further device writes after the ack.
NoWriteAfterAck ==
  \A u \in Users : pulling[u] # None => pulling[u] \notin delivered

=============================================================================
