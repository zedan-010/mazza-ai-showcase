# Go-to-market

As CEO I own sales and marketing. I combined hands-on outbound (cold calling, WhatsApp and email outreach, founder-led demos) with an internal outbound engine I built into the Mazza operations console.

[Back to overview](../README.md)

## The outbound engine

```text
Discover businesses  ->  Research each one  ->  Score fit  ->  Outreach + follow-up cadence  ->  Pipeline
```

### 1. Discovery

Search for target businesses (car rentals, salons, clinics, event companies) by area and category, and add them to a prospect pipeline.

### 2. Research and enrichment

For each prospect, the engine:

1. **Crawls the business's website**, with protection against server-side request forgery (it will not fetch internal or private addresses).
2. **Extracts contact details deterministically** from the page: emails, WhatsApp links, Instagram, phone numbers, LinkedIn. No AI in this step: a link either exists or it does not.
3. Runs **one small, fast LLM pass** that summarizes the business, writes the angle for Mazza, and scores sector fit, digital presence and size. **Contactability is scored in code** from what step 2 found, not by the model.
4. Saves the research and score, and fills in **only empty contact fields**. It never overwrites something a person typed.

The split is deliberate: use code for facts that can be checked, and the model only for judgment.

### 3. Follow-up cadence

A small rules engine with no side effects (so it is easy to test) decides the next follow-up after every outreach. Follow-ups are spaced a few days apart, capped at a fixed number of touches, and **stop automatically** when the prospect replies, books a discovery call or the deal closes. This fills a daily "today" queue of who to call or message next.

### 4. Email campaigns

Multi-step campaigns run from a daily scheduled job, in batches. Steps can be written manually or drafted by AI from the prospect's research. Every send goes through one email function that enforces **suppression lists and unsubscribe links**, and every touch is logged on the prospect's timeline.

## Marketing analytics

The console syncs campaign data from Meta and tracks the public website funnel with atomic counters and rate limits, so I can see which channels produce demos.

## Founder-led sales

- Cold calling UAE service businesses and running live demos of the voice and WhatsApp agents.
- A rule I hold the product to: **no social proof we do not have.** The website says "Now accepting early partners" rather than inventing customer counts.
