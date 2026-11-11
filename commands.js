// Định nghĩa toàn bộ Slash Command — dùng chung cho deploy-commands.js (chạy tay)
// và cho bot tự đồng bộ mỗi khi khởi động (bot1.js).
require("dotenv").config({ quiet: true });
const {
  SlashCommandBuilder,
  ChannelType,
  PermissionFlagsBits,
} = require("discord.js");
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
    .setName("setgia")
    .setDescription(
      "[Admin] Sửa giá bán trực tiếp: chọn nhóm → chọn sản phẩm → nhập giá mới.",
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

  new SlashCommandBuilder()
    .setName("setup-welcome")
    .setDescription("[Admin] Cài đặt chào mừng cư dân mới + auto-role (thay bot welcome riêng).")
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Kênh gửi tin chào mừng thành viên mới")
        .setRequired(false)
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
    )
    .addStringOption((option) =>
      option
        .setName("loi_chao")
        .setDescription("Lời chào tùy chỉnh. Dùng {user}, {username}, {server}, {memberCount}")
        .setRequired(false)
        .setMaxLength(1000),
    )
    .addRoleOption((option) =>
      option
        .setName("role")
        .setDescription("Role tự động cấp cho thành viên mới (tùy chọn)")
        .setRequired(false),
    )
    .addBooleanOption((option) =>
      option
        .setName("tat")
        .setDescription("Chọn Có để TẮT welcome (bỏ qua các mục còn lại)"),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("setup-log")
    .setDescription("[Admin] Đặt kênh lưu transcript (.txt) mỗi khi ticket bị đóng/xoá.")
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Kênh nhận file lưu trữ ticket")
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
];

module.exports = { commands };
