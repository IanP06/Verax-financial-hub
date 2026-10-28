import { readFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { spawn } from 'node:child_process';
import { seedLocalLab } from './seed-local-lab.mjs';

try {
    const local = JSON.parse(readFileSync('tmp/lab-runtime.json', 'utf8'));
    if (!process.env.JAVA_HOME && local.javaHome) process.env.JAVA_HOME = local.javaHome;
} catch { /* use installed Java */ }
if (process.env.JAVA_HOME) process.env.PATH = `${join(process.env.JAVA_HOME, 'bin')}${delimiter}${process.env.PATH}`;
process.env.FUNCTIONS_DISCOVERY_TIMEOUT = '60';
const children = [];
const start = args => {
    const child = spawn(process.execPath, args, { stdio: 'inherit', windowsHide: true });
    children.push(child); return child;
};
const emulator = start(['node_modules/firebase-tools/lib/bin/firebase.js', 'emulators:start', '--config', 'firebase.lab.json', '--project', 'demo-verax-lab']);
const stop = () => { for (const child of children) child.kill(); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
emulator.on('exit', () => { stop(); process.exitCode = 0; });
let ready = false;
for (let attempt = 0; attempt < 90; attempt++) {
    if (emulator.exitCode !== null) throw new Error('Los emuladores no pudieron arrancar. Revisá Java 21 y los puertos locales.');
    try {
        const response = await fetch('http://127.0.0.1:4400/emulators');
        const services = await response.json();
        if (services.auth && services.firestore && services.storage && services.functions) { ready = true; break; }
    } catch { /* startup */ }
    await new Promise(resolve => setTimeout(resolve, 1000));
}
if (!ready) { stop(); throw new Error('No se iniciaron los emuladores dentro del tiempo esperado.'); }
try { await seedLocalLab(); }
catch (error) { stop(); throw error; }
start(['node_modules/vite/bin/vite.js', '--mode', 'lab', '--host', '127.0.0.1', '--port', '5173', '--strictPort']);
console.log('Financial Hub LAB: http://127.0.0.1:5173 · Firebase local: http://127.0.0.1:4000 · Ctrl+C para cerrar.');
