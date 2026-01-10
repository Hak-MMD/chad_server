const { nextDay, nextMonth } = require("./dateHelpers");

async function resetUsageStats(stats) {
  const now = new Date();
  let modified = false;

  if (stats.dailyResetAt <= now) {
    stats.dailyCount = 0;
    stats.dailyResetAt = nextDay();
    modified = true;
  }

  if (stats.monthlyResetAt <= now) {
    stats.monthlyCount = 0;
    stats.monthlyResetAt = nextMonth();
    modified = true;
  }

  if (modified) {
    await stats.save();
  }
}

module.exports = resetUsageStats;
