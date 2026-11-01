//! The kit's own help texts for the "?" drawer (ux-chassis-9), one per kit
//! page. Plain English for the person using the dashboard: what the page
//! shows and what each action does, never how the code works. Kept apart
//! from the registry so the words can be read and edited as a block. They
//! are trusted HTML written here; `Page::help` takes the same for a
//! project's own pages.

pub(super) const STATUS: &str = "\
<h3>What this page shows</h3>\
<p>Whether this service is working right now. The tiles at the top give the health, the \
version that is running and how long it has been up. Anything that needs attention is \
listed under them, worst first, each with what to do about it.</p>\
<h3>The cards</h3>\
<ul>\
<li><strong>Service</strong>: what is running here and since when.</li>\
<li><strong>Health</strong>: each part of the service and whether it can do its job. \
One failing part makes the whole service report as degraded.</li>\
<li><strong>Updates</strong>: the running version against the newest release.</li>\
<li><strong>Availability</strong>: how often the service answered over the last 48 hours.</li>\
</ul>\
<h3>What the buttons do</h3>\
<ul>\
<li><strong>Check for updates</strong> looks for a newer release right now. \
It never installs anything.</li>\
<li><strong>Every 30 s</strong> (next to the title) chooses how often the page reads \
the status again. Off keeps what you see until you ask.</li>\
<li><strong>More</strong> in the header copies the health address that monitoring \
reads, or downloads everything on this page as a file.</li>\
</ul>";

pub(super) const PASSKEYS: &str = "\
<h3>What this page shows</h3>\
<p>The ways you can sign in to this dashboard. A passkey lets you sign in with your \
fingerprint, face or device lock instead of typing the login token.</p>\
<h3>What the buttons do</h3>\
<ul>\
<li><strong>Register this device</strong> creates a passkey on the device you are \
using now. Your browser asks you to confirm it.</li>\
<li><strong>More</strong> in the header, then <em>Register on another device</em>, \
shows a code you scan with your phone to create the passkey there.</li>\
</ul>\
<h3>Good to know</h3>\
<p>Passkeys only work on a secure (HTTPS) address; on a plain address the button is \
off and says why. The login token keeps working, so you can always get back in.</p>";

pub(super) const STORAGE: &str = "\
<h3>What this page shows</h3>\
<p>How much room this service's data takes on disk, what it is made of, and how to \
clear out what you no longer need.</p>\
<h3>Space used</h3>\
<p>Everything the service keeps, against its <strong>budget</strong>. The budget is a \
warning line you choose: crossing it makes the page tell you, but nothing is ever \
deleted for you. <strong>Pending writes</strong> is the short list of changes the \
database has accepted but not yet folded into its main file; it empties by itself and \
stays small, so a big number there is normal only for a moment.</p>\
<h3>What the buttons do</h3>\
<ul>\
<li><strong>Clean up</strong> (on a row of the table) removes old data of that kind. \
You pick what goes, see a preview of how much that is, and type the name of the kind \
to confirm. Nothing is removed before that.</li>\
<li><strong>Compact</strong> gives back empty space inside the file after deletions. \
It pauses writes for a moment and never touches the sign-in data.</li>\
<li><strong>Save</strong> and <strong>Reset</strong> next to the budget keep or undo \
your new warning line.</li>\
</ul>";

/// The clients page's help; `label` is what the project calls them
/// ("Clients", "Apps", "Senders").
pub(super) fn clients(label: &str) -> String {
    let what = label.to_lowercase();
    format!(
        "<h3>What this page shows</h3>\
<p>Every program that calls this service. Each one has its own token, so you can switch \
one off without touching the rest. The list shows who is in use, who has been quiet and \
when each was last seen.</p>\
<h3>What the buttons do</h3>\
<ul>\
<li><strong>Issue</strong> creates a new entry and shows its token once. Copy it \
straight away: it cannot be shown again after you close the window.</li>\
<li><strong>Manage</strong> opens one entry: its details, a way to send a test, its \
recent requests, and the buttons to re-issue or revoke it.</li>\
<li><strong>Re-issue</strong> gives an entry a new token; the old one stops working \
at once.</li>\
<li><strong>Revoke</strong> switches an entry off. Its history stays.</li>\
</ul>\
<h3>Searching</h3>\
<p>Type in the search box to filter the {what}; the table headers sort them.</p>"
    )
}
