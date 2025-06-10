/** @type {import('pm2').EcosystemConfig} */
module.exports = {
  apps: [{
    name: 'lz-oapp-server',
    script: 'src/server.ts',
    interpreter: 'node',
    interpreter_args: '--require ts-node/register',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'development',
      PORT: '3000'
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: '3000'
    },
    error_file: 'logs/err.log',
    out_file: 'logs/out.log',
    time: true,
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
  }]
}; 