'use strict';
const readline = require('readline');

const isWin = process.platform === 'win32';
const isTTY = process.stdout.isTTY && !process.env.NO_COLOR;

// ANSI helpers — degrade gracefully on dumb terminals
const c = (code, text) => isTTY ? `\x1b[${code}m${text}\x1b[0m` : text;
const green  = (t) => c('32', t);
const red    = (t) => c('31', t);
const yellow = (t) => c('33', t);
const cyan   = (t) => c('36', t);
const dim    = (t) => c('2', t);
const bold   = (t) => c('1', t);

// Icons — ASCII fallback on Windows cmd
const ok   = isWin && !isTTY ? '[OK]' : green('✓');
const fail = isWin && !isTTY ? '[!!]' : red('✗');
const warn = isWin && !isTTY ? '[!!]' : yellow('!');
const dot  = isWin && !isTTY ? '*'    : '·';

function spinner(message) {
  if (!isTTY) {
    process.stdout.write(`  ${message}\n`);
    return {
      update(msg) { process.stdout.write(`  ${msg}\n`); },
      succeed(msg) { process.stdout.write(`  ${ok} ${msg}\n`); },
      fail(msg) { process.stdout.write(`  ${fail} ${msg}\n`); },
      stop() {},
    };
  }
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;
  let text = message;
  const timer = setInterval(() => {
    process.stdout.write(`\r  ${cyan(frames[i++ % frames.length])} ${text}  `);
  }, 80);
  return {
    update(msg) { text = msg; },
    succeed(msg) { clearInterval(timer); process.stdout.write(`\r  ${ok} ${msg}  \n`); },
    fail(msg) { clearInterval(timer); process.stdout.write(`\r  ${fail} ${msg}  \n`); },
    stop() { clearInterval(timer); process.stdout.write('\r'); },
  };
}

/**
 * Arrow-key select menu. Returns selected option's value.
 * options: [{ label: string, hint?: string, value: any }]
 */
function selectMenu(title, options) {
  return new Promise((resolve) => {
    if (options.length === 1) {
      console.log(`  ${ok} ${options[0].label}${options[0].hint ? dim(` ${options[0].hint}`) : ''}`);
      return resolve(options[0].value);
    }

    let selected = 0;
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    readline.emitKeypressEvents(process.stdin, rl);

    const render = () => {
      // Move cursor up to overwrite
      if (selected >= 0) process.stdout.write(`\x1b[${options.length}A`);
      for (let i = 0; i < options.length; i++) {
        const prefix = i === selected ? cyan('❯') : ' ';
        const label = i === selected ? bold(options[i].label) : options[i].label;
        const hint = options[i].hint ? dim(` ${options[i].hint}`) : '';
        process.stdout.write(`\r  ${prefix} ${label}${hint}  \x1b[K\n`);
      }
    };

    if (title) console.log(`\n  ${title}`);
    // Print initial options
    for (let i = 0; i < options.length; i++) {
      const prefix = i === selected ? cyan('❯') : ' ';
      const label = i === selected ? bold(options[i].label) : options[i].label;
      const hint = options[i].hint ? dim(` ${options[i].hint}`) : '';
      process.stdout.write(`  ${prefix} ${label}${hint}\n`);
    }

    const onKey = (ch, key) => {
      if (!key) return;
      if (key.name === 'up' && selected > 0) { selected--; render(); }
      else if (key.name === 'down' && selected < options.length - 1) { selected++; render(); }
      else if (key.name === 'return') {
        process.stdin.removeListener('keypress', onKey);
        if (process.stdin.isTTY) process.stdin.setRawMode(false);
        rl.close();
        resolve(options[selected].value);
      }
      else if (key.name === 'c' && key.ctrl) {
        process.stdin.removeListener('keypress', onKey);
        if (process.stdin.isTTY) process.stdin.setRawMode(false);
        rl.close();
        process.exit(0);
      }
    };
    process.stdin.on('keypress', onKey);
  });
}

/**
 * Simple readline prompt. Returns trimmed answer.
 */
function prompt(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`  ${question}`, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function banner(version) {
  console.log('');
  console.log(`  ${bold('VoiceClaw Bridge')} ${dim(`v${version}`)}`);
  console.log('');
}

module.exports = { green, red, yellow, cyan, dim, bold, ok, fail, warn, dot, spinner, selectMenu, prompt, banner };
