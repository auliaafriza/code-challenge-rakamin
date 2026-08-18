#!/usr/bin/env bash
#
# Commits the Section 3.3 fixes — the 13 findings from the manual QA
# walkthrough, plus two defects found while fixing them.
#
# Run this from your own Terminal, inside the repository:
#
#     cd /Users/mac/Documents/nitip/live-code-frontend/ai-interview-platform
#     bash commit-3-3.sh
#
# It stages only the files this batch touched, in five commits that each stand
# on their own. Nothing is pushed; review with `git log -p` first.
#
set -euo pipefail
cd "$(dirname "$0")"

git rev-parse --is-inside-work-tree >/dev/null

echo "Branch: $(git branch --show-current)"
echo

# ── 1 · shared primitives ────────────────────────────────────────────────────
git add web/src/components/ui/toast.tsx \
        web/src/components/ui/toast.test.tsx \
        web/src/components/PageHeader.tsx \
        web/src/components/FormField.tsx \
        web/src/components/ConfirmDialog.tsx \
        web/src/main.tsx
git commit -m "feat(web): add the four primitives the assessor screens were missing

Four of the walkthrough findings were one finding wearing different clothes:
create an assessment, edit an assessment, create a vacancy, edit a vacancy — all
four saved in complete silence. The page changed, and that was the only signal
anything had happened. A navigation is not confirmation; it looks identical to a
redirect after a failure.

- toast: a dependency-free provider behind role=status/aria-live=polite.
  Errors live 7s against a success's 4s, because an error is the one message the
  user has to read and act on. Timers are cleared on unmount.
- PageHeader: one breadcrumb convention. The app had two — 'Vacancies / New
  Vacancy' on one screen and 'Back / New Assessment' on the next — mixing a
  location trail with a verb, so the same control meant different things on
  adjacent pages. The back affordance is now always an arrow AND the word Back,
  which the bare icon never was for a screen reader.
- FormField: required marks that carry a word, not just an asterisk, and
  validation messages that are actually rendered and wired via aria-describedby.
- ConfirmDialog: a confirmation step in front of anything irreversible, which
  stays open while the request is in flight so a failure is reported against the
  thing the user was looking at.

Tests cover the announcement, the differing durations, and stacking."

# ── 2 · the interview language ───────────────────────────────────────────────
git add web/src/utils/constants.ts \
        web/src/utils/dueDates.test.ts \
        web/src/services/assessments.ts \
        web/src/types/index.ts \
        web/src/pages/assessments/AssessmentEditPage.tsx \
        web/src/pages/assessments/AssessmentInvitePage.tsx \
        web/src/pages/assessments/AssessmentListPage.tsx \
        web/src/pages/assessments/AssessmentNewPage.tsx
git commit -m "fix(web): stop the edit form silently overwriting the interview language

The language decides which language the AI interviewer speaks to a candidate. It
was collected on the create form and then shown nowhere — not on the list, not
on the detail page, and not on the edit form that claims to let you change it.

Worse than absent: AssessmentEditPage's reset() never loaded \`language\`, so the
form opened on the 'en' default, and the update payload then wrote that default
back over whatever the assessor had actually chosen. Editing the time limit
silently switched a Bahasa Indonesia interview to English. The first person to
find out was the candidate, mid-interview.

The field is now loaded, rendered, marked required, and sent on both Create and
Edit, and the chosen language is displayed on the list and the detail page so
the mistake is visible before anyone is invited. LANGUAGE_LABELS mirrors
Assessment::SUPPORTED_LANGUAGES and falls back to the raw code rather than
rendering an empty space where the setting is supposed to be.

AssessmentEditPage also no longer swallows a failed load into an empty catch and
renders a blank form — indistinguishable from an assessment with no skills, and
one Save away from erasing one."

# ── 3 · due dates ────────────────────────────────────────────────────────────
git add api/db/migrate/20260814000002_add_expiry_dates_and_session_naming.rb \
        api/app/models/assessment.rb \
        api/app/models/vacancy.rb \
        api/app/controllers/api/v1/assessments_controller.rb \
        api/app/controllers/api/v1/vacancies_controller.rb \
        api/db/schema.rb
git commit -m "feat(api): give assessments and vacancies an end date

An invite link, once generated, stayed valid forever. An assessor could close a
role in March and a candidate could still walk into the AI interview in
November, be recorded, be graded, and have a portfolio written about them for a
job that no longer exists. The product had no way to express 'this process is
over', so it never was.

That is a data-protection problem as much as a UX one: UU PDP asks a controller
to state how long personal data is retained and for what purpose, and a hiring
process with no defined end answers neither.

Both columns are nullable, so every existing row keeps today's behaviour until
someone sets a date. Neither model validates the date as future-dated — an
expired assessment must stay saveable, or an assessor could not reopen it by
editing the very field that closed it.

A closed vacancy is labelled, never hidden: existing Fit/Gap reports were
written against it and hiding it would strand them."

# ── 4 · sessions are evidence about a person ─────────────────────────────────
git add api/app/controllers/api/v1/sessions_controller.rb \
        api/config/routes.rb \
        api/spec/requests/session_lifecycle_spec.rb \
        web/src/services/sessions.ts
git commit -m "feat(api): require a candidate name, allow a rename, refuse to erase evidence

Three claims the UI now makes, enforced where they have to be.

The candidate name was optional, producing a list of 'Candidate 1', 'Candidate
2' rows nobody could match to a real person — in a tool whose output is a hiring
judgement about that person. It is now required at creation and correctable
afterwards, because a typo in a candidate's name is not cosmetic here: it is the
label on the evidence.

PATCH /sessions/:id edits the name and nothing else. Status, timings and end
reason are a record of what happened and are not the assessor's to rewrite.

DELETE /sessions/:id is restricted to invites nobody has used. Once a candidate
has spoken, the transcript is the basis of a decision that was already acted on
— precisely the record UU PDP expects a controller to be able to produce.

An expired assessment stops issuing invites, and a candidate holding a link to
one is turned away at the door with 410 rather than sitting through an interview
for a closed role. A session already in progress is deliberately allowed to
finish: cutting someone off mid-answer because a date rolled over would destroy
their work.

Specs cover all six behaviours, including both halves of the delete rule."

# ── 5 · the forms themselves ─────────────────────────────────────────────────
git add web/src/components/assessment/CustomSkillForm.tsx \
        web/src/components/assessment/CustomSkillForm.test.tsx \
        web/src/components/assessment/SkillCard.tsx \
        web/src/components/assessment/LevelRadio.tsx \
        web/src/pages/vacancies/VacancyNewPage.tsx \
        web/src/pages/vacancies/VacancyEditPage.tsx \
        web/src/pages/vacancies/VacancyListPage.tsx \
        web/src/services/vacancies.ts
git commit -m "fix(web): make the skill forms say what is wrong, and stop the crosstalk

The custom skill form asks for seven required fields, every one of them a
definition the AI will later grade a human being against. All seven were
registered required:true and not one rendered a message. Leave any single field
blank and react-hook-form blocks the submit, the Save button re-enables, and the
page sits there — no message, no focus move, no indication which of the seven is
the problem. The assessor's only feedback that anything had happened was that
nothing had happened.

Each field now names its own failure, next to itself, wired through
aria-describedby, and the card validates on Selesai so the message lands beside
the field rather than blocking a submit at the bottom of the page. Custom skills
collapse to a summary once finished, so three custom skills are three cards and
not three unbounded forms stacked on each other; Batal on a never-saved skill
removes it instead of leaving an empty definition behind.

Two defects found while fixing these:

LevelRadio rendered the same five DOM ids — level-1 … level-5 — in every
instance. A form with three skills had three elements called level-3, and
<label for> binds to the first one in the document: clicking L3 on the third
skill card moved the radio on the first. Scoped with useId.

VacancyEditPage's submit handler had no catch at all, only finally. A failed
save left the button re-enabled and the page unchanged, which reads exactly like
a save that was never clicked.

Also: the drag handle now has an accessible name that mentions the keyboard
path dnd-kit already supported, the 'Add skill' buttons no longer sit flush
against the empty state as though they were part of the placeholder, and both
assessments and vacancies can finally be deleted — the endpoints existed all
along, nothing in the UI called them, so a mistyped record stayed forever."

echo
echo "✓ done — 5 new commits"
echo
git log --oneline -6
echo
echo "Before running the app:"
echo "  cd api && bundle exec rails db:migrate     # adds expires_at / closes_at"
echo "  cd web && npm install                      # test deps are declared but not installed"
echo "  cd web && npm test                         # vitest"
echo "  cd api && bundle exec rspec                # request + service specs"
echo
echo "Then: git push -u origin $(git branch --show-current)"
echo
echo "Note: _to_delete/ holds temp archives the bridge could not remove."
echo "      Delete that folder yourself; it is not staged by this script."
