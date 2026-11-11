// Chạy tay: "npm run deploy" — đăng ký slash command lên server trong config.GUILD_ID.
// Lưu ý: bot1.js giờ TỰ ĐỘNG đồng bộ lệnh mỗi khi khởi động, nên bình thường
// bạn KHÔNG cần chạy file này nữa, chỉ cần restart bot.
require("dotenv").config({ quiet: true });
const { REST, Routes } = require("discord.js");
const config = require("./config.js");
const { commands } = require("./commands.js");

const rest = new REST({ version: "10" }).setToken(config.DISCORD_TOKEN);

async function deploy() {
  try {
    console.log("🔄 Đang bắt đầu đăng ký các Slash Command...");
    const data = await rest.put(
      Routes.applicationGuildCommands(config.CLIENT_ID, config.GUILD_ID),
      { body: commands },
    );
    console.log(`✅ Đã đăng ký thành công ${data.length} Slash Command vào Server ID: ${config.GUILD_ID}`);
  } catch (error) {
    console.error("❌ Lỗi khi đăng ký Slash Command:", error);
  }
}

if (require.main === module) {
  deploy();
}

module.exports = { deploy, commands };
