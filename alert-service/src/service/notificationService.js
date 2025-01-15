class NotificationService {
  notify(alert) {
    if (!alert) return;

    switch (alert.type) {
      case 'rise':
      case 'fall':
      case 'normal':
        this.notifyPriceChange(alert);
        break;
      case 'portfolio':
        this.notifyPortfolioChange(alert);
        break;
      case 'current-portfolio':
        this.notifyCurrentPortfolio(alert);
        break;
    }
  }

  notifyPriceChange(alert) {
    const { type, fund, code, growth, netValue, estimatedValue, updateTime } = alert;
    
    let status = '';
    if (type === 'rise') {
      status = '📈 上涨';
    } else if (type === 'fall') {
      status = '📉 下跌';
    } else {
      status = '持平';
    }

    console.log(`\n基金名称: ${fund} (${code})`);
    console.log(`最新涨跌: ${status} ${growth}%`);
    console.log(`单位净值: ${netValue}`);
    console.log(`估算净值: ${estimatedValue}`);
    console.log(`更新时间: ${updateTime}`);
  }

  notifyPortfolioChange(alert) {
    const { fund, date, changes } = alert;
    console.log(`\n【基金调仓信息】${fund} - ${date}`);
    console.log('持仓变化:');
    
    if (!changes || changes.length === 0) {
      console.log('  暂无调仓信息');
      return;
    }
    
    changes.forEach(({ stock, change }) => {
      const direction = change > 0 ? '📈 增持' : '📉 减持';
      console.log(`  ${stock}: ${direction} ${Math.abs(change)}%`);
    });
  }

  notifyCurrentPortfolio(data) {
    const { fundCode, fundName, reportDate, stocks, lastAdjustment } = data;
    console.log(`\n【当前持仓信息】${fundCode} ${fundName || ''}`);
    
    // 格式化日期显示
    const dateStr = reportDate === '未知' ? '未知' : `${reportDate} (${this.getDateDiff(reportDate)})`;
    console.log(`报告日期: ${dateStr}`);
    
    // 显示调仓信息
    if (lastAdjustment) {
      console.log('\n【调仓信息】');
      const { date, lastDate, changes, summary } = lastAdjustment;
      
      // 显示调仓日期
      if (date && date !== '未知') {
        console.log(`本期报告: ${date} (${this.getDateDiff(date)})`);
      }
      if (lastDate && lastDate !== '未知') {
        console.log(`上期报告: ${lastDate} (${this.getDateDiff(lastDate)})`);
      }

      // 显示调仓详情
      if (changes && changes.length > 0) {
        console.log('\n持仓变动:');
        changes.forEach(change => {
          const direction = change.change > 0 ? '+' : '';
          console.log(`  ${change.stock.padEnd(8)} ${change.code} ${direction}${change.change.toFixed(2)}% ` +
            `(${change.oldWeight.toFixed(2)}% → ${change.newWeight.toFixed(2)}%)`);
        });
      }

      // 显示调仓总结
      if (summary) {
        console.log(`\n调仓总结: ${summary}`);
      }
    }
    
    if (!stocks || stocks.length === 0) {
      console.log('  暂无持仓信息');
      return;
    }

    // 计算最长的股票名称长度
    const maxStockLength = Math.max(...stocks.map(s => s.stock.length));

    // 分析行业分布
    const industries = this.analyzeIndustries(stocks);

    console.log('\n前十大持仓:');
    console.log('  序号 股票名称' + ' '.repeat(maxStockLength - 4) + ' 代码    权重    所属行业');
    console.log('  ' + '='.repeat(maxStockLength + 30));

    let totalWeight = 0;
    stocks.forEach((item, index) => {
      const { stock, code, weight, industry } = item;
      const paddedIndex = String(index + 1).padStart(2, '0');
      const paddedStock = stock.padEnd(maxStockLength);
      const weightStr = weight ? weight.toFixed(2).padStart(5) + '%' : '  ---';
      const industryStr = industry || this.guessIndustry(stock) || '';
      console.log(`  ${paddedIndex}. ${paddedStock} ${code} ${weightStr}  ${industryStr}`);
      totalWeight += weight || 0;
    });

    // 显示前十大持仓总仓位
    if (totalWeight > 0) {
      console.log('\n前十大持仓总仓位: ' + totalWeight.toFixed(2) + '%');
    }

    // 显示行业分布
    if (industries.length > 0) {
      console.log('\n行业分布:');
      industries.forEach(({ industry, weight, count }) => {
        console.log(`  ${industry.padEnd(6)}: ${weight.toFixed(2)}% (${count}只)`);
      });
    }
  }

  // 分析行业分布
  analyzeIndustries(stocks) {
    const industries = {};
    stocks.forEach(stock => {
      const industry = stock.industry || this.guessIndustry(stock.stock);
      if (industry) {
        if (!industries[industry]) {
          industries[industry] = { weight: 0, count: 0 };
        }
        industries[industry].weight += stock.weight || 0;
        industries[industry].count++;
      }
    });

    return Object.entries(industries)
      .map(([industry, data]) => ({
        industry,
        weight: data.weight,
        count: data.count
      }))
      .sort((a, b) => b.weight - a.weight);
  }

  // 根据股票名称猜测行业
  guessIndustry(stockName) {
    const industryKeywords = {
      '银行': ['银行'],
      '证券': ['证券'],
      '保险': ['保险'],
      '房地产': ['地产', '房产', '置业'],
      '医药': ['医药', '生物', '制药', '医疗'],
      '科技': ['科技', '电子', '芯片', '半导体'],
      '消费': ['食品', '饮料', '白酒', '啤酒'],
      '新能源': ['新能源', '光伏', '风电', '储能'],
      '有色': ['矿业', '黄金', '铜业', '铝业'],
      '军工': ['航空', '航天', '军工'],
      '汽车': ['汽车', '摩托'],
      '农业': ['农业', '种业', '牧业']
    };

    for (const [industry, keywords] of Object.entries(industryKeywords)) {
      if (keywords.some(keyword => stockName.includes(keyword))) {
        return industry;
      }
    }
    return null;
  }

  // 计算日期差
  getDateDiff(dateStr) {
    if (!dateStr || dateStr === '未知') return '';
    
    const now = new Date();
    const date = new Date(dateStr);
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return '今天';
    if (diffDays === 1) return '昨天';
    if (diffDays === 2) return '前天';
    if (diffDays <= 7) return `${diffDays}天前`;
    if (diffDays <= 30) return `${Math.floor(diffDays / 7)}周前`;
    if (diffDays <= 365) return `${Math.floor(diffDays / 30)}个月前`;
    return `${Math.floor(diffDays / 365)}年前`;
  }
}

module.exports = new NotificationService();
