module.exports = {
  // 监控的基金列表
  fundList: ['166301'],

  // 提醒阈值设置
  threshold: {
    rise: 2,    // 上涨超过2%提醒
    fall: -2    // 下跌超过2%提醒
  },

  // 定时任务配置
  schedule: {
    cron: '*/30 * 9-15 * * 1-5',  // 工作日9:00-15:00，每30分钟执行一次
    portfolioCheck: '0 0 9 * * 1-5'  // 每个工作日早上9点检查调仓信息
  },

  // 调仓检查配置
  portfolio: {
    checkDays: 7,  // 检查最近7天的调仓信息
    minPositionChange: 5  // 仓位变化超过5%才提醒
  }
}
