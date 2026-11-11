// Quản lý ảnh thương hiệu cho mọi embed.
// Ưu tiên file đặt trong thư mục assets/ (logo.png, banner.png, legit.gif) —
// bot tự upload kèm từng tin nhắn nên link KHÔNG bao giờ hết hạn như link CDN.
// Nếu chưa có file, dùng lại URL trong config.IMAGES.
const fs = require("fs");
const path = require("path");
const { AttachmentBuilder } = require("discord.js");
const config = require("./config.js");

const ASSETS_DIR = path.join(__dirname, "assets");

const IMAGES = {
  logo: { file: "logo.png", fallback: config.IMAGES.logo },
  banner: { file: "banner.png", fallback: config.IMAGES.banner },
  legit: { file: "legit.gif", fallback: config.IMAGES.legitGif },
};

function resolveRef(key) {
  const { file, fallback } = IMAGES[key];
  if (fs.existsSync(path.join(ASSETS_DIR, file))) return `attachment://${file}`;
  return fallback || null;
}

function resolveFile(key) {
  const { file } = IMAGES[key];
  const filePath = path.join(ASSETS_DIR, file);
  if (!fs.existsSync(filePath)) return null;
  return new AttachmentBuilder(filePath, { name: file });
}

module.exports = {
  logo: resolveRef("logo"),
  banner: resolveRef("banner"),
  legit: resolveRef("legit"),
  logoFile: () => resolveFile("logo"),
  bannerFile: () => resolveFile("banner"),
  legitFile: () => resolveFile("legit"),
  // Gom các file đính kèm cần thiết cho một lần gửi tin nhắn.
  collectFiles: (...keys) =>
    keys
      .map((key) => resolveFile(key))
      .filter(Boolean),
};
