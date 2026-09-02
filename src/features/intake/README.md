Intake: the drop zone, the paste overlay, and the seam between what a worker
read and where it goes. It knows nothing about the buffer — the buffer and
DiffChecker are its consumers — and it parses nothing itself: every format goes
through `src/workers`, and what comes back is either a document or a state the
card has to show.
