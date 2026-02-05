// Listening Stats - Tracker Extension
// This extension runs in the background to track listening activity.
// The UI is provided by the CustomApp.

import { initTracker, recoverPendingEvents } from "./services/tracker";

// Main extension entry point
async function main(): Promise<void> {
  console.log("[ListeningStats] Tracker extension starting...");

  // Recover any pending events from last session
  await recoverPendingEvents();

  // Initialize the play tracker
  initTracker();

  console.log("[ListeningStats] Tracker extension loaded!");
}

// Wait for Spicetify APIs to be ready
(function init() {
  if (!Spicetify.Player || !Spicetify.Platform) {
    setTimeout(init, 100);
    return;
  }
  main();
})();
