import { configure } from '@testing-library/dom';

// Máy chậm / chạy song song nhiều file (đặc biệt khi đo độ phủ) có thể làm giao diện cập nhật trễ hơn 1 giây mặc định
// của findBy / waitFor → nới lên 8 giây để test không chập chờn. Test vẫn thất bại nhanh khi hết thời gian thật sự.
configure({ asyncUtilTimeout: 8000 });
