// Exercise the real shutdown handler without Windows' forceful process.kill.
import '../../src/index.ts';

process.on('message', (message) => {
  if (message === 'shutdown') {
    process.disconnect?.();
    process.emit('SIGINT');
  }
});
