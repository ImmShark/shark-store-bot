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

  new SlashCommandBuilder()
    .setName("set-revenue")
    .setDescription("[Admin] Cập nhật tổng doanh thu thủ công cho dashboard.")
    .addIntegerOption((option) =>
      option
        .setName("amount")
        .setDescription("Tổng doanh thu (VND)")
        .setRequired(true)
        .setMinValue(0),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("set-price")
    .setDescription("[Admin] Đổi giá một dòng trong bảng giá, không cần deploy.")
    .addStringOption((option) =>
      option.setName("category").setDescription("Mã category của bảng giá").setRequired(true),
    )
    .addIntegerOption((option) =>
      option.setName("item").setDescription("Số thứ tự dòng giá (bắt đầu từ 1)").setRequired(true).setMinValue(1),
    )
    .addStringOption((option) =>
      option.setName("price").setDescription("Giá hiển thị, ví dụ: 150.000 VNĐ").setRequired(true).setMaxLength(80),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("announce")
    .setDescription("[Admin] Gửi thông báo dạng embed vào một kênh.")
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Kênh nhận thông báo")
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
    )
    .addStringOption((option) =>
      option.setName("title").setDescription("Tiêu đề thông báo").setRequired(true).setMaxLength(256),
    )
    .addStringOption((option) =>
      option.setName("content").setDescription("Nội dung thông báo").setRequired(true).setMaxLength(4000),
    )
    .addStringOption((option) =>
      option
        .setName("color")
        .setDescription("Màu: hồng, xanh, đỏ, vàng, tím")
        .setRequired(false)
        .addChoices(
          { name: "Hồng", value: "pink" },
          { name: "Xanh", value: "blue" },
          { name: "Đỏ", value: "red" },
          { name: "Vàng", value: "yellow" },
          { name: "Tím", value: "purple" },
        ),
    )
    .addStringOption((option) =>
      option.setName("image_url").setDescription("Link banner/ảnh (không bắt buộc)").setRequired(false).setMaxLength(2000),
    )
    .addBooleanOption((option) =>
      option.setName("ping_everyone").setDescription("Tag @everyone cùng thông báo (mặc định: không)"),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("announce-template")
    .setDescription("[Admin] Gửi nhanh mẫu thông báo sale, bảo trì hoặc restock.")
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Kênh nhận thông báo")
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
    )
    .addStringOption((option) =>
      option
        .setName("template")
        .setDescription("Mẫu thông báo")
        .setRequired(true)
        .addChoices(
          { name: "🔥 Sale", value: "sale" },
          { name: "🔧 Bảo trì", value: "maintenance" },
          { name: "📦 Restock", value: "restock" },
        ),
    )
    .addBooleanOption((option) =>
      option.setName("ping_everyone").setDescription("Tag @everyone (mặc định: không)"),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("thongbao-banggia")
    .setDescription("[Admin] Gửi thông báo bảng giá dịch vụ Tạo Bot Discord mới.")
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Chọn kênh muốn gửi thông báo (mặc định: kênh hiện tại)")
        .setRequired(false)
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
    )
    .addRoleOption((option) =>
      option
        .setName("ping")
        .setDescription("Role muốn tag khi thông báo (ví dụ @everyone hoặc @Khách Hàng)")
        .setRequired(false),
    )
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
