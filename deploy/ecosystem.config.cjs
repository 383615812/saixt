// PM2 进程守护配置
// 说明：本服务为 SQLite（node:sqlite）单写者，生产**必须保持单实例**
// 运行（instances: 1），不要开 cluster 多进程，否则多个 Node 进程写同一 SQLite 文件
// 会串行化并放大锁竞争。扩容走「单实例 + 更高规格」或后续迁移 MySQL。
// 使用：pm2 start deploy/ecosystem.config.cjs --env production
module.exports = {
  apps: [
    {
      name: 'saixt-server',
      script: 'src/index.js',
      cwd: '/opt/saixt/server',
      instances: 1, // SQLite 单写者，禁止 >1
      exec_mode: 'fork', // 单进程 fork，非 cluster
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        TRUST_PROXY: 1, // 前面有 Nginx 一层反向代理
      },
      env_production: {
        NODE_ENV: 'production',
        TRUST_PROXY: 1,
      },
      max_memory_restart: '300M', // 内存超限自动重启，兜底内存泄漏
      kill_timeout: 15000, // 给优雅关闭（SIGTERM）留出时间，超过后强杀
      listen_timeout: 10000,
      restart_delay: 3000,
      autorestart: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: '/var/log/saixt/server-error.log',
      out_file: '/var/log/saixt/server-out.log',
      merge_logs: true,
      time: true,
    },
  ],
};