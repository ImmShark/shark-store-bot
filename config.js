require("dotenv").config();

module.exports = {
  // Thông tin bot & Server
  DISCORD_TOKEN: process.env.DISCORD_TOKEN,
  CLIENT_ID: process.env.CLIENT_ID || "1407054148729573446",
  GUILD_ID: process.env.GUILD_ID || "1013847341649887232",
  OWNER_ID: process.env.OWNER_ID || "1013433356832219157",
  STAFF_ROLE_ID: process.env.STAFF_ROLE_ID || "1206284744145375292",
  TICKET_CATEGORY_ID: process.env.TICKET_CATEGORY_ID || "1013848320478818335",

  // Thông tin thanh toán VietQR
  BANK_INFO: {
    bankId: "MB", // Mã ngân hàng MB Bank
    bankName: "MB BANK",
    accountNo: "0328206839",
    accountName: "LE HOANG VU",
    defaultMemo: "SHARKSTORE",
    logoUrl:
      "https://media.discordapp.net/attachments/1160008472893603871/1512106856594669679/logo.gif?ex=6a238b80&is=6a223a00&hm=71cf0d3bb9c37b681ecba2fe634b865789bcef8195cd6206bc7568d934fcd0cd&=&width=623&height=533",
  },

  // Đường dẫn lưu cấu hình
  SETTINGS_FILE: "./guild_settings.json",
};
