// dev only: renders Droppy for the app icon (see tools/icon.js)
import { render } from './character.js';
const params = new URLSearchParams(location.search);
const host = document.getElementById('host');
host.className = `buddy-host ${params.get('state') || 'happy'}`;
render(host, { character: 'droppy' }, { freeze: Number(params.get('t')) || 0.6, viewH: 240, viewCY: 105 });
