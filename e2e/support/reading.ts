/**
 * How long a test waits for a document that has been dropped to have been read.
 *
 * It is one number for the whole suite because the wait is always about the
 * same thing, and it is nothing to do with what any of these tests are asking.
 * Reading a document is real work in a real worker: the script is fetched,
 * evaluated and handed the file, and in a browser that will not run a module
 * worker the script fetched instead is the whole of every parser in one bundle,
 * megabytes of it. How long that takes is a property of the machine the suite
 * is running on - three browser projects and their workers on six cores is an
 * ordinary local run - and it can be seconds when nothing is wrong at all.
 *
 * The default of five seconds is right for a wait on something the page does
 * itself and wrong for this one, and getting it wrong is expensive in a way
 * that is hard to see: the test goes red on a busy machine, the failure names
 * whichever assertion happened to be first, and the suite teaches whoever runs
 * it that red means nothing. Generous here costs nothing on a run that passes,
 * because the wait ends the moment the card says how long the text is.
 */
export const READING_MS = 30_000;
