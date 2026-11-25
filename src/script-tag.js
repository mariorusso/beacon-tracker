// entry for the <script> build
import * as BeaconTracker from './index.js';

// has to be read now, currentScript is null once this finishes running
const script = document.currentScript;

window.BeaconTracker = BeaconTracker;

if (script?.hasAttribute('data-endpoint')) {
  BeaconTracker.init({
    endpoint: script.dataset.endpoint,
    debug: script.hasAttribute('data-debug'),
  });
}
