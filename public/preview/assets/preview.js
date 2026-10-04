'use strict';
const form = document.getElementById('preview-form');
const result = document.getElementById('result');
const brief = document.getElementById('brief');
form.addEventListener('submit', event => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  const data = new FormData(form);
  brief.textContent = [
    'DEMONSTRATION — not sent or booked',
    `Service: ${data.get('service')}`,
    `Type: ${data.get('type')}`,
    `Details: ${data.get('description')}`,
    `Frequency / condition: ${data.get('cadence')}`,
    `Location: ${data.get('location')}`,
    `Preferred timing: ${data.get('timing') || 'To discuss'}`,
    `Notes: ${data.get('notes') || 'None'}`
  ].join('\n');
  result.hidden = false;
  result.scrollIntoView({behavior: 'smooth', block: 'nearest'});
});
document.getElementById('copy').addEventListener('click', async () => {
  const status = document.getElementById('copy-status');
  try {
    await navigator.clipboard.writeText(brief.textContent);
    status.textContent = 'Copied. This example has not been sent.';
  } catch (_) {
    status.textContent = 'Select the brief above and copy it manually.';
  }
});
