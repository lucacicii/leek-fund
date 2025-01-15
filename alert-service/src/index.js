const schedule = require('node-schedule');
const config = require('../config');
const fundService = require('./service/fundService');
const notificationService = require('./service/notificationService');

async function checkFunds() {
  const { fundList, threshold } = config;
  
  for (const fundCode of fundList) {
    const alert = await fundService.checkFundAlert(fundCode, threshold);
    notificationService.notify(alert);
  }
}

async function checkPortfolio() {
  const { fundList } = config;
  
  for (const fundCode of fundList) {
    const alert = await fundService.getPortfolioChanges(fundCode, config);
    notificationService.notify(alert);
  }
}

async function checkCurrentPortfolio() {
  const { fundList } = config;
  
  for (const fundCode of fundList) {
    const data = await fundService.getCurrentPortfolio(fundCode);
    notificationService.notify({
      type: 'current-portfolio',
      ...data
    });
  }
}

// 启动时立即执行一次查询
async function initialize() {
  console.log('开始查询最新数据...\n');
  
  console.log('【净值查询】');
  await checkFunds();
  
  console.log('\n【当前持仓】');
  await checkCurrentPortfolio();
  
  console.log('\n【调仓信息】');
  await checkPortfolio();
  
  console.log('\n定时任务已启动:');
  console.log('- 净值监控: 工作日 9:00-15:00 每30分钟检查一次');
  console.log('- 调仓监控: 工作日每天早上9点检查一次');
}

// 启动净值监控定时任务
schedule.scheduleJob(config.schedule.cron, checkFunds);

// 启动调仓监控定时任务
schedule.scheduleJob(config.schedule.portfolioCheck, checkPortfolio);

// 立即执行初始化
initialize();
