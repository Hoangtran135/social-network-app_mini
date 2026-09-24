module.exports = {
  apps: [
    {
      name: "social-network-app",
      script: "dist/server.cjs",
      // Luôn chạy trong thư mục project để đọc đúng .env và thư mục uploads/
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      watch: false,
      max_memory_restart: "300M",
    },
  ],
};
