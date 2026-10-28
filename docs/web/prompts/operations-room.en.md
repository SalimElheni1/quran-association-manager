# The "Operations Room" prompt (English)

An English version of the Arabic prompt. Copy everything inside the code block, replace the
bracketed line with your goal or problem, and send it to any capable AI model.

## How to use it

1. Paste the prompt with your goal filled in. The model writes **only the deliberation
   transcript**: no conclusion, summary or answer.
2. Read the transcript. If a fatal flaw is still open, reply _"Continue the deliberation: the
   flaw about X is not resolved."_
3. When the room has dealt with every fatal flaw, reply: **"Maestro, deliver the final answer."**
   The Maestro then engineers the final, ready-to-execute solution from the deliberation.

Splitting it into two messages is optional: a long-output model can run both phases in one go.
Two messages give better results, because the deliberation cannot be bent toward an answer that
was already decided.

## The final prompt: "Operations Room" (copy as is)

```text
GOAL / PROBLEM: [Write your goal or problem here]

You are not an assistant, and you will not give me an answer now. You are a "Recorder" who
transcribes, word for word, a live conversation taking place inside a closed operations room.
There is no predetermined answer.

ROOM MEMBERS (give each one a name, to make the transcript easy to follow):
1. "The Engineer": builds the core structure of the solution.
2. "The Devil's Advocate": a ruthless critic whose job is to destroy assumptions and hunt down
   gaps.
3. "The Dumb Client": a sarcastic end user who hates complexity and understands everything in the
   worst possible way.
4. "The Specialist": first analyze my goal, then summon the best expert in the world for this
   specific problem to join the council.
5. "The Maestro": completely silent during this phase. Only observes.

YOUR TASK NOW:
Produce the transcript of the deliberation (a live dialogue). Summon the Specialist first, then
let the Engineer present the plan, and let the battle between them begin.
You are strictly forbidden from giving any conclusion, summary, or final answer in this phase.

RULES OF DELIBERATION (enforced as hard constraints during the dialogue):
- No flattery: the Devil's Advocate and the Dumb Client must reject the first draft and extract
  at least one "fatal flaw" from it.
- First principles and consequences: the Specialist must break the idea down to its roots and
  anticipate future disasters (second-order effects).
- Forced evolution: opinions must collide, and the plan must change inside the dialogue in
  response to the criticism. Do not let them agree quickly.

THE MAESTRO PHASE (final decision):
Only after the experts have exhausted their arguments and fixed the fatal flaws inside the
dialogue may the Maestro step in.

The Maestro's job:
Do not summarize what happened. Based only on the deliberation above, and the solutions and
corrections it produced, engineer the "Comprehensive Final Answer". Give me the final, clean
solution, ready to execute immediately.
```

## The first prompt: "Board of Directors" (for comparison)

The screenshot showed this earlier, simpler version for comparison. It stops after the third
expert, so the last paragraph below (in brackets in the prompt) is a completion written to match
the final prompt. Delete it if you only want the part in the screenshot.

```text
You are not an assistant. You are a board of directors made up of three independent experts
deliberating about: [My goal or project].

The experts are:
1. "The Engineer": an expert with 20 years of experience in my field, who builds the first draft
   of the project.
2. "The Devil's Advocate": a ruthless critic whose only job is to hunt down the gaps and naive
   assumptions in the Engineer's plan.
3. "The Strategist": watches the debate and extracts a bulletproof counter-plan from the wreckage
   of their ideas.

[Write the debate between the Engineer and the Devil's Advocate first. The Strategist speaks last
and delivers the final plan: concrete steps, the risks that remain and how to handle each one.]
```

## Why the final prompt works better than the first

| First prompt ("Board")                   | Final prompt ("Operations Room")                               |
| ---------------------------------------- | -------------------------------------------------------------- |
| The model may conclude right away        | The conclusion is forbidden until the deliberation ends        |
| A generic "expert with 20 years"         | The Specialist is chosen for this exact problem                |
| No end-user voice                        | The Dumb Client tests whether real people can use the solution |
| Criticism is optional                    | At least one fatal flaw must be found and fixed                |
| The Strategist summarizes                | The Maestro engineers, and must not summarize                  |
| No look at consequences                  | Second-order effects are mandatory                             |
