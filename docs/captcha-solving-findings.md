# CAPTCHA Solving with Agent Web Interface

Date: 2026-03-30

## Overview

We tested the agent-web-interface browser automation tools against three types of CAPTCHAs to evaluate capability limits and develop effective strategies.

**Browser config used:** `isolated: true`, `headless: true` (fresh profile, no cookies, no history, no visible window)

---

## Results Summary

| CAPTCHA Type              | Provider             | Mode                  | Result                       | Attempts |
| ------------------------- | -------------------- | --------------------- | ---------------------------- | -------- |
| Text distortion           | BotDetect            | headed, connected     | 1/3 solved                   | 3        |
| Non-interactive challenge | Cloudflare Turnstile | headless + isolated   | Passed (test keys)           | 1        |
| Image grid challenge      | Google reCAPTCHA v2  | headless + isolated   | **Solved**                   | 3        |
| Animation challenge       | hCaptcha             | auto_connect (headed) | **Failed** (user intervened) | 7        |

---

## 1. BotDetect (Text CAPTCHA)

**URL:** `https://captcha.com/demos/features/captcha-demo.aspx`

**How it works:** Displays a distorted text image. User must type the characters.

**Approach:** Screenshot the CAPTCHA image, use vision to read characters, type into input field, click Validate.

**Results:**

- Attempt 1: `ETY8AA` — **Correct**
- Attempt 2: `V3HN` — **Incorrect** (page scrolled, may have read stale image)
- Attempt 3: `D57M83` — **Incorrect** (heavy distortion)

**Takeaway:** Vision/OCR works on cleaner images but fails on heavy distortion. ~33% success rate. The distortion is specifically designed to defeat automated reading.

---

## 2. Cloudflare Turnstile

**URL:** `https://demo.turnstile.workers.dev/`

**How it works:** Non-interactive challenge — runs background browser checks (proof-of-work, fingerprinting, behavioral signals) without requiring user input.

**Approach:** Simply navigate to the page. The widget auto-solves.

**Result:** Passed immediately. Server response confirmed:

```json
{
  "success": true,
  "challenge_ts": "2026-03-30T16:24:26.541Z",
  "hostname": "example.com",
  "metadata": { "result_with_testing_key": true }
}
```

**Caveat:** The demo uses Cloudflare's **test site key**, which always passes regardless of client. `result_with_testing_key: true` confirms this. A production deployment with real keys would likely behave differently.

---

## 3. Google reCAPTCHA v2 (Image Grid)

**URL:** `https://www.google.com/recaptcha/api2/demo`

**How it works:** Checkbox triggers an image grid challenge. User must select all tiles matching a category (e.g., "buses", "traffic lights", "motorcycles").

### Failed Attempts (Sequential Clicks)

reCAPTCHA immediately detects headless/automated browsers and **always** forces an image challenge (never passes on checkbox click alone).

**Problem:** Each click requires a full MCP round-trip (~2-3s). With 4-7 tiles to select plus a VERIFY click, the total time exceeded reCAPTCHA's expiry window for suspected bots.

**Result:** "Verification challenge expired. Check the checkbox again." — every time.

### Successful Attempt (Parallel Clicks)

**Key insight:** Fire all tile clicks as **parallel tool calls** in a single message. This completes all clicks in one round-trip instead of N sequential round-trips.

**Strategy:**

1. Click "I'm not a robot" checkbox to trigger the challenge modal
2. Screenshot to identify:
   - The challenge prompt (e.g., "Select all images with a bus")
   - Grid layout (3x3 or 4x4)
3. Calculate x,y viewport coordinates for each target tile:

   **3x3 grid geometry:**
   - Grid origin: ~(95, 225)
   - Tile size: ~130px wide x 140px tall
   - Tile centers: col1=165, col2=300, col3=448 | row1=280, row2=420, row3=560

   **4x4 grid geometry:**
   - Grid origin: ~(95, 225)
   - Tile size: ~104px wide x 104px tall
   - Tile centers: col1=147, col2=251, col3=355, col4=459 | row1=277, row2=381, row3=485, row4=589

4. Fire **all tile clicks simultaneously** as parallel tool calls using x,y coordinates
5. Click VERIFY immediately after

**Result timeline:**

- Challenge 1 (traffic lights, 4x4 grid): Parallel clicks fired, hit VERIFY — **wrong answer** but no timeout
- Challenge 2 (buses, 3x3 grid): Parallel clicks fired, hit VERIFY — **passed**
- Checkbox turned green, form submitted: **"Verification Success... Hooray!"**

---

## 4. hCaptcha (Animation-Based)

**URL:** `https://accounts.hcaptcha.com/demo`

**How it works:** Shows an animated basketball bouncing towards one of 2-3 hoops. User must click the correct basket. Also has drag-puzzle and other challenge types.

### Challenge Types Encountered

1. **Basketball trajectory** — "Find which basket the BALL is moving towards"
2. **Puzzle piece drag** — "Please drag the piece on the right to its matching half"

### Failed Attempts (6 tries)

- Static screenshots can't reliably determine ball trajectory
- Back-to-back parallel screenshots capture the same composited frame (CDP returns the same render)
- Long waits (3-5s) between screenshots showed movement but the ball's arc is deceptive — it crosses over one basket before curving to the other
- Drag challenges require pixel-precise placement that's hard to nail

### Result

**Failed after 7 attempts.** The user manually intervened to solve the challenge. The agent could not reliably determine ball trajectory from static screenshots alone.

### What Might Work (Untested)

- Executing JavaScript inside the hCaptcha iframe to read the ball element's CSS transform/position at two different `requestAnimationFrame` ticks
- Using CDP's `Animation` domain to inspect running animations
- Computing velocity from DOM element positions sampled via `Runtime.evaluate` with a small `setTimeout` gap

### Why This Is Hard

- Animation-based challenges are fundamentally hostile to screenshot-based analysis
- CDP screenshots within the same event loop tick return identical frames
- The ball follows a parabolic arc that visually misleads about direction
- Multiple challenge types (basketball, puzzle drag) require different strategies
- hCaptcha rotates between challenge types unpredictably

---

## Key Learnings

### Why parallel clicks matter

- Sequential: N clicks x ~2.5s each = 10-17s total. reCAPTCHA expires before completion.
- Parallel: All clicks in ~2.5s total (single round-trip). Beats the expiry window.

### Why coordinate-based clicking is necessary

- Image grid tiles often don't appear as interactive elements in the semantic snapshot
- After the first click, button eids become available, but calculating coordinates from the screenshot is faster and more reliable
- Grid geometry is consistent across challenges of the same type

### reCAPTCHA behavioral detection

- Headless browsers are fingerprinted immediately — checkbox never passes without a challenge
- The image challenge is the fallback, not the primary defense
- Even with correct answers, reCAPTCHA may serve multiple rounds
- Wrong answers get a "Please try again" with a new challenge (doesn't expire the session)

### What doesn't work

- Sequential clicking (timeout)
- Waiting for screenshots between each click (too slow)
- Trying to use element IDs for grid tiles (they may not be in the snapshot)

---

## Tool Call Pattern

```
# Step 1: Navigate
navigate(url, isolated=true, headless=true)

# Step 2: Click checkbox
click(eid="<checkbox-eid>")

# Step 3: Screenshot to analyze challenge
screenshot()

# Step 4: Parallel clicks on target tiles (CRITICAL - must be parallel)
click(x=165, y=280)  \
click(x=448, y=280)  |  ALL IN ONE MESSAGE
click(x=165, y=560)  /

# Step 5: Immediately verify
click(eid="<verify-button-eid>")

# Step 6: If wrong answer, repeat from step 3
# Step 7: If passed, submit the form
```
