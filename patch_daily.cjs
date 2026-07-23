const fs = require('fs');
let code = fs.readFileSync('api-handlers/calls.js', 'utf8');

code = code.replace(
  /start_audio_off:\s*false/,
  'start_audio_off: false,\n              enable_prejoin_ui: false'
);

fs.writeFileSync('api-handlers/calls.js', code);
