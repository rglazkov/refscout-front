Comparing two texts: the ceilings a pane is measured against (`text.ts`) and the
comparison itself (`compare.ts`), which runs in a worker and hands back a
finished list of changed ranges.

The pass is over lines rather than characters, and that is the point of the
module. Each line gets an identity, the merge package's algorithm runs over the
sequence of identities, and only the runs it marks as changed are then compared
character by character. Measured on a thesis of thirty thousand lines: a hundred
scattered edits are a hundred changes in 30 ms, where the same algorithm over
the characters answers "everything between the first edit and the last is one
change".
