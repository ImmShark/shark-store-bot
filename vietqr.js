const config = require("./config.js");

/**
 * Sinh link ảnh mã VietQR tự động điền số tiền và nội dung chuyển khoản
 * Sử dụng SePay VietQR endpoint trả về trực tiếp ảnh định dạng PNG chuẩn (Discord Embed hiển thị 100% không bị lỗi SVG).
 * @param {Object} params
 * @param {string} [params.bankId] Mã ngân hàng (mặc định MB)
 * @param {string} [params.accountNo] Số tài khoản
 * @param {string} [params.accountName] Tên chủ tài khoản
 * @param {number|string} [params.amount] Số tiền cần thanh toán
 * @param {string} [params.memo] Nội dung chuyển khoản
 * @param {string} [params.template] Giao diện QR ('compact', 'qronly', 'standee')
 * @returns {string} URL ảnh VietQR PNG
 */
function generateVietQR({
  bankId = config.BANK_INFO.bankId,
  accountNo = config.BANK_INFO.accountNo,
  accountName = config.BANK_INFO.accountName,
  amount = null,
  memo = config.BANK_INFO.defaultMemo,
  template = "compact",
} = {}) {
  const queryParams = new URLSearchParams();

  queryParams.append("bank", bankId || "MB");
  queryParams.append("acc", accountNo);
  if (template) {
    queryParams.append("template", template);
  }
  if (amount && Number(amount) > 0) {
    queryParams.append("amount", Math.round(Number(amount)));
  }
  if (memo) {
    queryParams.append("des", memo);
  }
  if (accountName) {
    queryParams.append("holder", accountName);
  }

  return `https://qr.sepay.vn/img?${queryParams.toString()}`;
}

module.exports = {
  generateVietQR,
};
