require("dotenv").config();
const {
  REST,
  Routes,
  SlashCommandBuilder,
  ChannelType,
  PermissionFlagsBits,
} = require("discord.js");
const config = require("./config.js");
const qrCommand = require("./qr.js");

const commands = [
  new SlashCommandBuilder()
    .setName("banggia")
    .setDescription("Hiển thị bảng giá dịch vụ của shop."),

  new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Gửi bảng tạo ticket mua hàng & hỗ trợ."),

  qrCommand.data,

  new SlashCommandBuilder()
    .setName("setup-legit")
    .setDescription("[Admin] Thiết lập kênh để gửi tin nhắn legit.")
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Chọn kênh bạn muốn dùng để check legit.")
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("legit-stats")
    .setDescription("Xem tổng số đơn legit uy tín của Shark Store."),

  new SlashCommandBuilder()
    .setName("set-legit-count")
    .setDescription("[Admin] Thiết lập số đơn hàng uy tín hiện tại của shop.")
    .addIntegerOption((option) =>
      option
        .setName("soluong")
        .setDescription("Số lượng đơn hàng legit hiện tại (ví dụ: 347)")
        .setRequired(true)
        .setMinValue(0),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("setup-verify")
    .setDescription("[Admin] Tự động tạo kênh xác minh và gửi bảng nút bấm Verify.")
    .addRoleOption((option) =>
      option
        .setName("role")
        .setDescription("Chọn role Khách Hàng (để trống bot sẽ tự tìm)")
        .setRequired(false),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("setup-server")
    .setDescription("[Admin] Xem trước và áp dụng bố cục kênh Shark Store.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
];

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
