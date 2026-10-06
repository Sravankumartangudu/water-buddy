// dev only: renders frozen poses side by side. ?shots=state@time@dir|...
import { render } from './character.js';
const params = new URLSearchParams(location.search);
for (const spec of params.get('shots').split('|')) {
  const [state, time, dir] = spec.split('@');
  const cell = document.createElement('div');
  cell.className = 'cell';
  const host = document.createElement('div');
  host.className = `buddy-host ${state}`;
  host.style.setProperty('--dir', dir || '1');
  const label = document.createElement('span');
  label.textContent = `${state || 'stand'} @${time}`;
  cell.append(host, label);
  document.body.appendChild(cell);
  render(host, { character: params.get('char') || 'droppy' }, { freeze: Number(time), viewH: Number(params.get('vh')) || 0, viewCY: Number(params.get('cy')) || 0 });
}
