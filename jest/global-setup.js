// The fake world (jest/world.ts) and the scenario labels ("Sep 22–Oct 22, 2025") were written in Istanbul local time.
// Pin it so the suite gives the same answer on a laptop and on a UTC CI runner.
module.exports = async () => {
  process.env.TZ = 'Europe/Istanbul';
};
