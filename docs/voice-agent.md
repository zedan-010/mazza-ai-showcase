# Voice agent

The voice agent answers a business's calls, understands what the caller needs, looks up live business data, and turns the conversation into a booking request, a lead or a handoff to a human.

[Back to overview](../README.md)

## Three generations

| Generation | Approach | Why I moved on |
| --- | --- | --- |
| 1. Managed voice platform | A hosted voice-agent provider, configured and synced from the Mazza dashboard, with tools calling back into Mazza. | Fast to ship, but little control over latency, turn-taking and data retention. |
| 2. My own realtime runtime | A Python pipeline over WebRTC: streaming speech-to-text, a learned end-of-turn model, an LLM with tools, and streaming text-to-speech. Controlled by a "control plane" in the Next.js app. | Full control and deep measurement, but many providers to tune, and bilingual speech recognition was the weakest link. |
| 3. Native speech-to-speech | A realtime speech model handles listening, speaking and interruptions. It hands complex reasoning and tool use to a separate reasoning model through a trusted server connection. | Current direction. Simpler audio path, while keeping all business actions behind my own server-side checks. |

Keeping the earlier generations as measured baselines meant every change could be compared against something real.

## Control plane and runtime boundary

```text
Browser (WebRTC audio)
      |
Voice runtime  <-- short-lived signed ticket -->  Next.js control plane
      |                                              | auth, versioned agent config,
      |  tool calls with invocation IDs              | tool authorization, telemetry
      v                                              v
Trusted server tools  ----------------------->  Postgres (tenant-scoped)
```

- The runtime never receives database credentials. A short-lived signed ticket identifies a session, and the runtime claims an **immutable published release** of the agent's configuration.
- Organization scope, enabled tools and release permissions are checked on the server for every tool call. Secrets never reach the browser.
- Agent configuration has drafts and **immutable releases** with rollback. A release's business knowledge is frozen at publish time, so editing a source later cannot silently change a live agent.

## Latency engineering (generation 2)

Callers judge an agent by how long they wait. I measured every stage per turn and attacked the biggest costs:

- **Speculative generation:** start generating the answer before the caller has finished, and keep it only if the final transcript matches. Saved about 400 to 660 ms per hit.
- **Prompt caching, pre-warmed with the tool schemas:** 100% of input tokens served from cache in tests.
- **Raw streaming HTTP client** in place of the SDK: about 200 to 290 ms saved per request.
- **A short spoken bridge before every lookup** ("let me check that"), enforced as a required tool parameter so silence never hides a slow tool.
- **End-of-turn detection** with a trained model plus a safety timeout for incomplete speech.

Result on synthetic browser calls: perceived wait about 225 ms (p50), first word of the real answer about 1.9 s (p50), cost about $0.03 per minute. These are browser test measurements, not phone-line or production figures, and I label them that way.

## Listening sounds (backchannels)

Humans say "mm-hmm", "oh, I'm sorry" or "perfect" while listening. Early versions reacted too often and at the wrong moments, and it sounded unnatural. I rewrote the listener to choose a reaction from **what the caller actually said** (sympathy, congratulations, thanks, acknowledging an answer), with structural caps: at most one sound per turn and a rate ceiling per minute. On a replayed call that the team had rated badly, inappropriate sounds dropped from 20 to 0. Bilingual vetoes prevent English-only cues during Arabic or mixed speech.

## Safety before any business action

- Before creating a booking request or a final human follow-up, an **independent server-side check** looks for the agent's read-back and the caller's confirmation in the conversation, including later corrections or cancellations.
- Confirmed actions have a **stable identity across retries**: a retried tool call replays the saved result instead of acting twice.
- An interruption alone does not cancel a business action. Caller changes advance a conversation revision, and stale work is rechecked before writing.
- A pending booking request is never described to the caller as a confirmed reservation.

## Privacy

Mazza does not keep call recordings or full transcripts. Recording, detailed logging and transcript artifacts are switched off at the provider level on every agent sync. The app stores call metadata, a short summary, sentiment and a structured outcome reported by the agent through a dedicated outcome tool.

## Testing

- A browser **test lab** that refuses to start a call whose result could not be judged (missing credentials, exhausted quota, missing assets).
- Synthetic-microphone conversation tests, sandbox-only: they never create real bookings or message real staff.
- Per-turn telemetry with a turn ID on every event, plus cost accounting that separates measured usage from estimates.
- 270+ automated tests on the runtime.

## What I would research next

Gulf Arabic and English code-switched speech recognition, learned bilingual turn-taking, and formal measurement of tool-use reliability in live conversation. See [Research directions](../README.md#research-directions).
