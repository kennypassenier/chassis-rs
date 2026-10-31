// The counter that gives each bar without an id its own.

/** The count of ids handed out; shared by every bar on the page. */
const state = { seq: 0 };

/** The next bar id number. */
export const nextBarNumber = () => ++state.seq;
