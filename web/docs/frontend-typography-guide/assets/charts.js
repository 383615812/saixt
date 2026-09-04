(function() {
  var style = getComputedStyle(document.documentElement);
  var accent = style.getPropertyValue('--accent').trim();
  var accent2 = style.getPropertyValue('--accent2').trim();
  var ink = style.getPropertyValue('--ink').trim();
  var muted = style.getPropertyValue('--muted').trim();
  var rule = style.getPropertyValue('--rule').trim();
  var bg2 = style.getPropertyValue('--bg2').trim();

  // --- Chart: 字号阶梯跨断点对比 ---
  var chart1 = echarts.init(document.getElementById('chart-ladder'), null, { renderer: 'svg' });
  chart1.setOption({
    animation: false,
    color: [accent, accent2, '#7c3aed', '#ec4899'],
    tooltip: {
      trigger: 'axis',
      appendToBody: true,
      axisPointer: { type: 'shadow' },
      valueFormatter: function(v) { return v + 'rem'; }
    },
    legend: {
      top: 0,
      textStyle: { color: ink, fontSize: 12 },
      data: ['页面标题', '页头副标题', '主按钮', '小按钮', '标签', '轻提示', 'AI 消息']
    },
    grid: { left: 40, right: 16, top: 46, bottom: 36 },
    xAxis: {
      type: 'category',
      data: ['桌面', '≤600px', '≤480px', '≤400px'],
      axisLine: { lineStyle: { color: rule } },
      axisLabel: { color: ink, fontSize: 12 },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 1.7,
      name: 'rem',
      nameTextStyle: { color: muted, fontSize: 11 },
      splitLine: { lineStyle: { color: rule } },
      axisLabel: { color: muted, fontSize: 11 }
    },
    series: [
      {
        name: '页面标题',
        type: 'bar',
        data: [1.55, 1.3, 1.3, 1.2],
        barWidth: 12,
        itemStyle: { borderRadius: [3, 3, 0, 0] }
      },
      {
        name: '页头副标题',
        type: 'bar',
        data: [0.92, 0.86, 0.86, 0.82],
        barWidth: 12,
        itemStyle: { borderRadius: [3, 3, 0, 0] }
      },
      {
        name: '主按钮',
        type: 'bar',
        data: [0.95, 0.95, 0.88, 0.88],
        barWidth: 12,
        itemStyle: { borderRadius: [3, 3, 0, 0] }
      },
      {
        name: '小按钮',
        type: 'bar',
        data: [0.88, 0.88, 0.8, 0.8],
        barWidth: 12,
        itemStyle: { borderRadius: [3, 3, 0, 0] }
      },
      {
        name: '标签',
        type: 'bar',
        data: [0.78, 0.78, 0.78, 0.78],
        barWidth: 12,
        itemStyle: { borderRadius: [3, 3, 0, 0] }
      },
      {
        name: '轻提示',
        type: 'bar',
        data: [0.9, 0.86, 0.86, 0.86],
        barWidth: 12,
        itemStyle: { borderRadius: [3, 3, 0, 0] }
      },
      {
        name: 'AI 消息',
        type: 'bar',
        data: [1.0, 1.0, 1.0, 1.0],
        barWidth: 12,
        itemStyle: { borderRadius: [3, 3, 0, 0] }
      }
    ]
  });
  window.addEventListener('resize', function() { chart1.resize(); });
})();
