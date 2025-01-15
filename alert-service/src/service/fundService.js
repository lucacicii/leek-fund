const axios = require('axios');
const dayjs = require('dayjs');

class FundService {
  async getFundData(fundCode) {
    try {
      const url = `https://fundgz.1234567.com.cn/js/${fundCode}.js`;
      const response = await axios.get(url);
      const data = response.data.replace('jsonpgz(', '').replace(');', '');
      return JSON.parse(data);
    } catch (error) {
      console.error(`获取基金${fundCode}数据失败:`, error.message);
      return {};
    }
  }

  async checkFundAlert(fundCode, threshold) {
    const fundData = await this.getFundData(fundCode);

    const { name, gszzl, dwjz, gsz, gztime } = fundData;
    const growth = parseFloat(gszzl);

    return {
      type: growth >= threshold.rise ? 'rise' : growth <= threshold.fall ? 'fall' : 'normal',
      fund: name,
      code: fundCode,
      growth,
      netValue: dwjz,        // 单位净值
      estimatedValue: gsz,   // 估算净值
      updateTime: gztime     // 更新时间
    };
  }

  async getCurrentPortfolio(fundCode) {
    try {
      // 从基金持仓接口获取数据
      const positionUrl = `https://fundmobapi.eastmoney.com/FundMNewApi/FundMNInverstPosition?product=EFund&appVersion=6.4.9&serverVersion=6.4.9&FCODE=${fundCode}&deviceid=1&plat=Iphone&version=6.4.9`;
      const response = await axios.get(positionUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X)',
          'Accept': 'application/json',
          'Referer': 'https://mpservice.com/'
        }
      });

      if (!response.data || !response.data.Datas) {
        console.log('基金持仓接口返回空数据');
        return { fundCode, reportDate: '未知', stocks: [] };
      }

      const { Datas } = response.data;
      
      // 获取基金名称和报告日期
      const fundName = Datas.FSHORTNAME || '';
      let reportDate = '未知';

      // 尝试从基金档案获取最新净值日期
      try {
        const profileUrl = `https://fund.eastmoney.com/pingzhongdata/${fundCode}.js`;
        const profileResponse = await axios.get(profileUrl);
        const profileData = profileResponse.data;
        const dateMatch = profileData.match(/var FSRQ = "([^"]+)"/);
        if (dateMatch) {
          reportDate = dateMatch[1];
        }
      } catch (err) {
        console.error('获取基金档案日期失败:', err.message);
        reportDate = Datas.FSRQ || '未知';
      }

      // 解析股票持仓
      const stocks = (Datas.fundStocks || []).map(item => ({
        stock: item.GPJC,   // 股票名称
        code: item.GPDM,    // 股票代码
        weight: parseFloat(item.JZBL || '0')  // 持仓比例
      }));

      // 获取最后一次调仓信息
      const lastAdjustment = await this.getLastAdjustment(fundCode);

      return {
        fundCode,
        fundName,
        reportDate,
        stocks: stocks.slice(0, 10),
        lastAdjustment
      };

    } catch (error) {
      console.error('获取基金持仓信息失败:', error.message);
      
      // 如果移动端接口失败，尝试从基金档案获取
      try {
        console.log('尝试从基金档案获取...');
        const profileUrl = `https://fund.eastmoney.com/pingzhongdata/${fundCode}.js`;
        const profileResponse = await axios.get(profileUrl);
        const profileData = profileResponse.data;

        // 提取基金名称
        const nameMatch = profileData.match(/var fS_name = "([^"]+)"/);
        const fundName = nameMatch ? nameMatch[1] : '';

        // 提取最新净值日期
        const dateMatch = profileData.match(/var FSRQ = "([^"]+)"/);
        const reportDate = dateMatch ? dateMatch[1] : '未知';

        // 提取股票代码
        const stockCodesMatch = profileData.match(/var stockCodesNew =\[([\s\S]*?)\]/);
        if (!stockCodesMatch) {
          console.log('未找到股票代码数据');
          return { fundCode, reportDate: '未知', stocks: [] };
        }

        // 解析股票代码
        const stockCodes = stockCodesMatch[1]
          .split(',')
          .map(code => code.trim().replace(/"/g, ''))
          .filter(code => code);

        // 获取股票名称
        const stocks = [];
        for (const fullCode of stockCodes) {
          try {
            const [market, code] = fullCode.split('.');
            const stockCode = market === '1' ? `${code}.SH` : `${code}.SZ`;
            
            // 从行情接口获取股票名称
            const stockUrl = `https://push2.eastmoney.com/api/qt/stock/get?secid=${market}.${code}&fields=f57,f58`;
            const stockResponse = await axios.get(stockUrl, {
              headers: {
                'Referer': 'https://quote.eastmoney.com/'
              }
            });

            if (stockResponse.data && stockResponse.data.data) {
              const stockData = stockResponse.data.data;
              stocks.push({
                stock: stockData.f58,
                code: stockCode,
                weight: 0
              });
            }
          } catch (err) {
            console.error(`获取股票${fullCode}详情失败:`, err.message);
          }
        }

        return {
          fundCode,
          fundName,
          reportDate,
          stocks: stocks.slice(0, 10),
          lastAdjustment: null
        };

      } catch (profileError) {
        console.error('基金档案获取失败:', profileError.message);
        return {
          fundCode,
          reportDate: '未知',
          stocks: [],
          lastAdjustment: null
        };
      }
    }
  }

  async getLastAdjustment(fundCode) {
    try {
      // 获取调仓记录
      const url = `https://fundmobapi.eastmoney.com/FundMNewApi/FundMNInverstPosition?product=EFund&appVersion=6.4.9&serverVersion=6.4.9&FCODE=${fundCode}&deviceid=1&plat=Iphone&version=6.4.9&position=1`;
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X)',
          'Accept': 'application/json',
          'Referer': 'https://mpservice.com/'
        }
      });

      if (!response.data || !response.data.Datas) {
        return null;
      }

      const { Datas } = response.data;
      
      // 获取当前和上期持仓
      const currentStocks = this.parseStocks(Datas.fundStocks || []);
      const lastStocks = this.parseStocks(Datas.lastFundStocks || []);

      // 计算持仓变化
      const changes = this.calculateChanges(currentStocks, lastStocks);

      return {
        date: Datas.FSRQ || '未知',
        lastDate: Datas.lastFSRQ || '未知',
        changes,
        summary: this.generateSummary(changes)
      };

    } catch (error) {
      console.error(`获取基金${fundCode}调仓记录失败:`, error.message);
      return null;
    }
  }

  // 解析股票列表
  parseStocks(stocks) {
    return stocks.map(item => ({
      stock: item.GPJC,   // 股票名称
      code: item.GPDM,    // 股票代码
      weight: parseFloat(item.JZBL || '0')  // 持仓比例
    }));
  }

  // 计算持仓变化
  calculateChanges(currentStocks, lastStocks) {
    const changes = [];
    const stockMap = new Map();

    // 记录所有股票
    currentStocks.forEach(stock => {
      stockMap.set(stock.code, { 
        ...stock, 
        type: 'current'
      });
    });

    // 对比上期持仓
    lastStocks.forEach(stock => {
      const current = stockMap.get(stock.code);
      if (current) {
        // 股票仍在持仓中，计算变化
        const change = current.weight - stock.weight;
        if (Math.abs(change) >= 0.1) { // 变化超过0.1%才记录
          changes.push({
            stock: stock.stock,
            code: stock.code,
            oldWeight: stock.weight,
            newWeight: current.weight,
            change
          });
        }
        stockMap.delete(stock.code);
      } else {
        // 股票已退出持仓
        changes.push({
          stock: stock.stock,
          code: stock.code,
          oldWeight: stock.weight,
          newWeight: 0,
          change: -stock.weight
        });
      }
    });

    // 新增持仓
    stockMap.forEach(stock => {
      changes.push({
        stock: stock.stock,
        code: stock.code,
        oldWeight: 0,
        newWeight: stock.weight,
        change: stock.weight
      });
    });

    // 按变化幅度排序
    return changes.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  }

  // 生成调仓说明
  generateSummary(changes) {
    if (!changes || changes.length === 0) {
      return '无重大调仓';
    }

    const increased = changes.filter(c => c.change > 0)
      .sort((a, b) => b.change - a.change)
      .slice(0, 3);
      
    const decreased = changes.filter(c => c.change < 0)
      .sort((a, b) => a.change - b.change)
      .slice(0, 3);

    const summary = [];
    
    if (increased.length > 0) {
      const stocks = increased.map(c => `${c.stock}(+${c.change.toFixed(1)}%)`);
      summary.push(`增持: ${stocks.join('、')}`);
    }
    
    if (decreased.length > 0) {
      const stocks = decreased.map(c => `${c.stock}(${c.change.toFixed(1)}%)`);
      summary.push(`减持: ${stocks.join('、')}`);
    }

    return summary.join('；');
  }

  async getPortfolioChanges(fundCode, config) {
    try {
      // 获取基金详情页面
      const url = `https://fund.eastmoney.com/${fundCode}.html`;
      const response = await axios.get(url);
      
      // 解析调仓信息
      // 这里使用简单的字符串匹配，实际项目中建议使用 cheerio 等库进行 HTML 解析
      const html = response.data;
      const portfolioRegex = /<div[^>]*class="position_shares"[^>]*>([\s\S]*?)<\/div>/i;
      const dateRegex = /(\d{4}-\d{2}-\d{2})/;
      
      const portfolioMatch = html.match(portfolioRegex);
      if (!portfolioMatch) return null;

      const portfolioContent = portfolioMatch[1];
      const dateMatch = portfolioContent.match(dateRegex);
      if (!dateMatch) return null;

      const reportDate = dateMatch[1];
      const daysAgo = dayjs().diff(dayjs(reportDate), 'day');
      
      // 只返回最近 N 天的调仓信息
      if (daysAgo > config.portfolio.checkDays) return null;

      // 解析持仓变化
      const changes = this.parsePortfolioChanges(portfolioContent);
      
      // 过滤掉变化幅度小的调仓信息
      const significantChanges = changes.filter(
        change => Math.abs(change.change) >= config.portfolio.minPositionChange
      );

      if (significantChanges.length === 0) return null;

      return {
        type: 'portfolio',
        fund: fundCode,
        date: reportDate,
        changes: significantChanges
      };
    } catch (error) {
      console.error(`获取基金${fundCode}调仓信息失败:`, error.message);
      return null;
    }
  }

  parsePortfolioChanges(content) {
    const changes = [];
    // 使用正则表达式匹配股票名称和仓位变化
    const stockRegex = /([^<>]+)([+-]\d+\.\d+%)/g;
    let match;

    while ((match = stockRegex.exec(content)) !== null) {
      const [, stock, changeStr] = match;
      const change = parseFloat(changeStr.replace('%', ''));
      
      changes.push({
        stock: stock.trim(),
        change
      });
    }

    return changes;
  }
}

module.exports = new FundService();
