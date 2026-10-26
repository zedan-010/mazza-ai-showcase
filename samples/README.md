# Code samples

Small, standalone examples written for this case study. Each one is a simplified version of a real problem I solved in Mazza AI, not a copy of production code. In production these rules live in Postgres (unique constraints, atomic updates and scheduled sweepers); here they are in memory so the logic is easy to read and test.

| Sample | Problem it solves |
| --- | --- |
| [idempotent-tools](idempotent-tools/) | Voice and messaging providers retry tool calls, sometimes several copies at the same moment. A ledger keyed by a stable invocation ID makes "create booking" run exactly once, replays the saved result to retries, rejects reused IDs with different arguments, and separates retryable from permanent failures. |
| [message-debounce](message-debounce/) | WhatsApp customers write in bursts. A per-conversation debounce combines a burst into one reply, a lease (a lock that expires) stops two workers replying at once and stops a crashed worker blocking a conversation forever, and messages that arrive mid-reply are answered afterwards rather than lost. |
| [phone-normalizer](phone-normalizer/) | The same caller appeared as "0501234567" on one channel and "+971501234567" on another, creating duplicate customer profiles. One canonical E.164 format, UAE-first but safe for international numbers, fixes it. |

Run the tests (Node.js 22.18 or newer, no install needed):

```bash
node --test samples/idempotent-tools/ledger.test.ts
node --test samples/message-debounce/scheduler.test.ts
node --test samples/phone-normalizer/phone.test.ts
```
