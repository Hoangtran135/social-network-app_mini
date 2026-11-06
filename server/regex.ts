// Tiện ích chuỗi / regex dùng chung cho các API tìm kiếm.

/** Thoát ký tự đặc biệt của regex để người dùng gõ gì thì tìm đúng chữ đó (và không thể chèn regex độc hại). */
export const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
