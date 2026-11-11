require("dotenv").config({ quiet: true });
const path = require("path");

// Railway Volume: đặt DATA_DIR=/data để dữ liệu còn nguyên sau redeploy.
// Khi chạy local, bot tiếp tục lưu file ngay trong thư mục project.
const dataDir = process.env.DATA_DIR || ".";

module.exports = {
  // Thông tin bot & Server
  DISCORD_TOKEN: process.env.DISCORD_TOKEN,
  CLIENT_ID: process.env.CLIENT_ID || "1407054148729573446",
  GUILD_ID: process.env.GUILD_ID || "1013847341649887232",
  OWNER_ID: process.env.OWNER_ID || "1013433356832219157",
  STAFF_ROLE_ID: process.env.STAFF_ROLE_ID || "1206284744145375292",
  TICKET_CATEGORY_ID: process.env.TICKET_CATEGORY_ID || "1013848320478818335",

  // Ảnh thương hiệu dùng chung cho mọi embed.
  // Cách sửa nhanh nhất: upload ảnh vào 1 kênh Discord (kênh riêng), chuột phải
  // -> "Sao chép liên kết ảnh" rồi dán vào dưới đây.
  // Nếu đặt file vào thư mục assets/ (logo.png, banner.png, legit.gif) thì
  // bot sẽ ưu tiên dùng file đó và link sẽ KHÔNG bao giờ hết hạn.
  IMAGES: {
    logo: "https://media.discordapp.net/attachments/1160008472893603871/1512106856594669679/logo.gif?ex=6a238b80&is=6a223a00&hm=71cf0d3bb9c37b681ecba2fe634b865789bcef8195cd6206bc7568d934fcd0cd&=&width=623&height=533",
    banner:
      "https://media.discordapp.net/attachments/1160008472893603871/1512111182713065472/endd.png?format=webp&quality=lossless&width=1860&height=283",
    legitGif:
      "https://cdn.discordapp.com/attachments/1407102790320263208/1407241308526870620/standard_3.gif",
  },

  // Thông tin thanh toán VietQR
  BANK_INFO: {
    bankId: "MB", // Mã ngân hàng MB Bank
    bankName: "MB BANK",
    accountNo: "0328206839",
    accountName: "LE HOANG VU",
    defaultMemo: "SHARKSTORE",
  },

  // Đường dẫn lưu cấu hình
  SETTINGS_FILE: path.join(dataDir, "guild_settings.json"),
  DEFAULT_SETTINGS_FILE: path.join(__dirname, "guild_settings.json"),
};
